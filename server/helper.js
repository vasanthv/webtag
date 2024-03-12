const { Readability, isProbablyReaderable } = require("@mozilla/readability");
const rateLimiter = require("express-rate-limit");
const slowDown = require("express-slow-down");
const createDOMPurify = require("dompurify");
const webPush = require("web-push");
const { JSDOM } = require("jsdom");
const crypto = require("crypto");
const axios = require("axios");
const { URL } = require("url");

const config = require("./config");
const sendEmail = require("./email");
const { Users, Bookmarks } = require("./collections").getInstance();

/**
 * Pure Functions
 */
const getValidUsername = (username) => {
	if (!username) return httpError(400, "Invalid username");
	if (config.INVALID_HANDLES.includes(username.toLowerCase())) return httpError(400, "Invalid username");
	const usernameRegex = /^([a-zA-Z0-9]){1,18}$/;
	if (!usernameRegex.test(username)) return httpError(400, "Invalid username. Max. 18 alphanumeric chars.");
	return username.toLowerCase();
};
const getValidEmail = (email) => {
	if (!email) return httpError(400, "Empty email");
	if (!isValidEmail(email)) return httpError(400, "Invalid email");
	return email;
};
const getValidURL = (url) => {
	if (!url) return httpError(400, "Empty URL");
	if (!isValidUrl(url) || url.length > 2000) return httpError(400, "Invalid URL");
	return url;
};
const isValidEmail = (email) => {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const isValidUrl = (url) => {
	try {
		const _url = new URL(url);
		return ["http:", "https:"].includes(_url.protocol) ? Boolean(_url) : false;
	} catch (e) {
		return false;
	}
};
const getValidPassword = (password) => {
	if (!password) return httpError(400, "Invalid password");
	if (password.length < 8) return httpError(400, "Password length should be atleast 8 characters");
	return hashString(password);
};
const getValidTags = (tagString) => {
	return tagString
		.substr(0, 100)
		.replace(/[^a-zA-Z0-9@]/g, ",")
		.split(",")
		.filter((s) => !!s)
		.map((s) => s.toLowerCase());
};
const randomString = () => "_" + Math.random().toString(36).substr(2, 9);

const getURLContents = async (url) => {
	try {
		const { data } = await axios(url);
		return data;
	} catch (err) {
		return err.response?.data ?? "";
	}
};

const getPageTitle = (contents) => {
	try {
		const dom = new JSDOM(contents);
		return dom.window.document.title ?? "";
	} catch (err) {
		console.error(err);
		return "";
	}
};

const getReadableContent = async (contents) => {
	let response = {};
	try {
		const dom = new JSDOM(contents);
		if (!isProbablyReaderable(dom.window.document)) return response;
		let { textContent, content } = new Readability(dom.window.document).parse();
		const DOMPurify = createDOMPurify(dom.window);

		response = { text: textContent.trim(), content: DOMPurify.sanitize(content) };
		return response;
	} catch (err) {
		console.error(err);
		return response;
	}
};

/* Middlewares */
const attachUsertoRequest = async (req, res, next) => {
	if (req.session.token) {
		const token = req.session.token;
		req["token"] = token;
		req["user"] = await Users.findOne({ "devices.token": token });
	}
	next();
};
const attachUsertoRequestFromAPIKey = async (req, res, next) => {
	if (req.headers["x-api-key"] || req.headers["X-API-KEY"]) {
		const apiKey = req.headers["x-api-key"] || req.headers["X-API-KEY"];
		req["user"] = await Users.findOne({ apiKeys: apiKey });
	}
	next();
};
const isUserAuthed = (req, res, next) => {
	if (req.user) return next();
	res.status(401).json({ message: "Please log in" });
};
const csrfValidator = async (req, res, next) => {
	if (config.DISABLE_CSRF || req.method === "GET" || req.headers["x-api-key"] || req.headers["X-API-KEY"]) {
		return next();
	}
	if (!req.session.csrfs?.some((csrf) => csrf.token === req.headers["x-csrf-token"])) {
		return res.status(400).json({ message: "Page expired. Please refresh and try again" });
	}
	next();
};
const rateLimit = (options) => {
	return rateLimiter({
		max: 50,
		...options,
		windowMs: (options?.windowMs || 5) * 60 * 1000, // in minutes
		usernamer: (req, res) =>
			res.status(429).json({ message: `Too many requests. Try again after ${options?.windowMs || 5} mins` }),
	});
};
const speedLimiter = slowDown({
	windowMs: 15 * 60 * 1000, // 15 minutes
	delayAfter: 20, // allow 100 requests per 15 minutes, then...
	delayMs: () => 500, // begin adding 500ms of delay per request above 20
});

/* DB Helpers */
const isNewUsername = async (username, currentChannelId) => {
	let query = { username: { $regex: new RegExp(`^${username}$`, "i") } };
	if (currentChannelId) {
		query["_id"] = { $ne: currentChannelId };
	}

	const existingUsername = await Users.findOne(query).select("username").exec();
	return existingUsername ? httpError(400, "Username already taken") : username;
};
const isNewEmail = async (email, currentUserId) => {
	let query = { email };
	if (currentUserId) {
		query["_id"] = { $ne: currentUserId };
	}

	const existingEmail = await Users.findOne(query).select("email").exec();
	return existingEmail ? httpError(400, "Email already taken") : email;
};
const getUserByUsername = async (username, fields = "username name website createdOn contacts devices blocked") => {
	let query = { username: { $regex: new RegExp(`^${username}$`, "i") } };

	return await Users.findOne(query).select(fields).exec();
};
const getUserByEmail = async (email, fields = "username name website createdOn contacts devices blocked") => {
	let query = { email: { $regex: new RegExp(`^${email}$`, "i") } };

	return await Users.findOne(query).select(fields).exec();
};
const getRecipients = async (user, toUser) => {
	switch (toUser.username) {
		case "all": {
			const me = await Users.findOne({ _id: user._id })
				.populate([{ path: "contacts.user", select: "username contacts devices blocked" }])
				.exec();
			return me.contacts.map((c) => c.user);
		}
		default:
			return [toUser];
	}
};
const inviteEmail = async (user, email) => {
	const updateField = { $push: { invitees: email } };
	await Users.updateOne({ _id: user._id }, updateField);
	return await sendEmail.sendInviteEmail(user, email);
};

/* Send link as push notifications */
const sendPushNotification = async (recipient, title, body) => {
	const url = `${config.URL}read?title=${title}&body=${encodeURIComponent(body)}`;
	const payload = JSON.stringify({ title, body, url, appURL: config.URL });

	const pushPromises = [];
	recipient.devices?.forEach((device) => {
		if (device.pushCredentials) {
			pushPromises.push(webPush.sendNotification(device.pushCredentials, payload, config.PUSH_OPTIONS));
		}
	});

	try {
		await Promise.all(pushPromises);
	} catch (err) {
		console.error(err);
	}
};

const hashString = (str) => {
	return crypto.createHash("sha256", config.SECRET).update(str).digest("hex");
};

const saveBookmark = async (url, tags, user, titleText = "") => {
	let title = titleText ?? url.slice(0, 30) + (url.length > 30 ? "..." : "");

	// Get contents of the URL
	const urlContents = await getURLContents(url);

	if (urlContents && !titleText) {
		const _title = getPageTitle(urlContents);
		title = (_title ?? title).substring(0, 160);
	}

	const newBookmark = await new Bookmarks({
		url,
		title,
		createdOn: new Date(),
		updatedOn: new Date(),
		createdBy: user._id,
		tags,
	}).save();

	return newBookmark;
};

const updateReadableContent = async (bookmark) => {
	try {
		console.log(bookmark.url);
		// Get contents of the URL
		const urlContents = await getURLContents(bookmark.url);

		// update the readable content of the bookmarks
		if (urlContents) {
			const { text, content } = await getReadableContent(urlContents);

			console.log({ text, content });
			if (content) {
				await Bookmarks.updateOne({ _id: bookmark._id }, { textContent: text, readableContent: content });
			}
		}
	} catch (err) {
		// ignore
		console.log(err);
	}
};

//Throws a error which can be usernamed and changed to HTTP Error in the Express js Error handling middleware.
const httpError = (code, message) => {
	code = code ? code : 500;
	message = message ? message : "Something went wrong";
	const errorObject = new Error(message);
	errorObject.httpErrorCode = code;
	throw errorObject;
};

module.exports = {
	getValidUsername,
	getValidEmail,
	getValidURL,
	isValidEmail,
	isValidUrl,
	getValidPassword,
	getValidTags,
	randomString,
	getURLContents,
	getPageTitle,
	getReadableContent,
	isNewUsername,
	isNewEmail,
	getUserByUsername,
	getUserByEmail,
	hashString,
	httpError,
	attachUsertoRequest,
	attachUsertoRequestFromAPIKey,
	isUserAuthed,
	csrfValidator,
	rateLimit,
	speedLimiter,
	getRecipients,
	inviteEmail,
	sendPushNotification,
	saveBookmark,
	updateReadableContent,
};
