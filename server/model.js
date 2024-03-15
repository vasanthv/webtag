const { generateApiKey } = require("generate-api-key");
const randomString = require("randomstring");
const cheerio = require("cheerio");
const uuid = require("uuid").v4;
const axios = require("axios");

const config = require("./config");
const helper = require("./helper");
const sendEmail = require("./email");

const { Users, Bookmarks } = require("./collections").getInstance();

const signUp = async (req, res, next) => {
	try {
		const username = helper.getValidUsername(req.body.username);
		await helper.isNewUsername(username);
		const email = helper.getValidEmail(req.body.email);
		await helper.isNewEmail(email);
		const password = helper.getValidPassword(req.body.password);
		const userAgent = req.get("user-agent");
		const date = new Date();

		const emailVerificationCode = uuid();
		const token = uuid();

		await new Users({
			username,
			email,
			password,
			emailVerificationCode,
			devices: [{ token, userAgent }],
			createdAt: date,
		}).save();
		req.session.token = token;

		res.json({ message: "Account created. Please verify your email.", username });

		sendEmail.verificationEmail(username, email, emailVerificationCode);
	} catch (error) {
		next(error);
	}
};

const logIn = async (req, res, next) => {
	try {
		const username = helper.getValidUsername(req.body.username);
		const password = helper.getValidPassword(req.body.password);

		const user = await Users.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") }, password }).exec();

		if (!user) return helper.httpError(400, "Invalid user credentials");

		const userAgent = req.get("user-agent");

		const token = uuid();
		const devices = { token, userAgent };

		await Users.updateOne({ _id: user._id }, { $push: { devices }, lastLoginAt: new Date() });

		req.session.token = token;
		res.json({ message: "Logged in", username: user.username });
	} catch (error) {
		next(error);
	}
};

const verifyEmail = async (req, res, next) => {
	try {
		const code = req.params.code;

		const user = await Users.findOne({ emailVerificationCode: code }).exec();
		if (!user) return res.status(400).send("Invalid email verification code");

		await Users.updateOne({ _id: user._id }, { $unset: { emailVerificationCode: 1 }, lastUpdatedAt: new Date() });

		res.send("Email verified");
	} catch (error) {
		next(error);
	}
};

const resetPassword = async (req, res, next) => {
	try {
		const email = req.body.email;

		const channel = await Users.findOne({ email }).exec();
		if (!channel) return helper.httpError(400, "Invalid Email");

		const passwordString = randomString.generate(8);
		const password = await helper.getValidPassword(passwordString);

		await Users.updateOne({ _id: channel._id }, { password, lastUpdatedOn: new Date() });
		await sendEmail.resetPasswordEmail(channel.username, channel.email, passwordString);

		res.json({ message: "Password resetted" });
	} catch (error) {
		next(error);
	}
};

const me = async (req, res, next) => {
	try {
		const { username, email, createdOn, apiKeys, defaultTags, devices } = req.user;

		res.json({
			username,
			email,
			createdOn,
			defaultTags,
			apiKeys,
			pushEnabled: devices.some((d) => d.token === req.token && !!d.pushCredentials),
		});
	} catch (error) {
		next(error);
	}
};

const updateAccount = async (req, res, next) => {
	try {
		const email =
			req.body.email && req.body.email !== req.user.email ? await helper.getValidEmail(req.body.email) : null;
		if (email) await helper.isNewEmail(email, req.user._id);

		const password = req.body.password ? await helper.getValidPassword(req.body.password) : null;

		const defaultTags = req.body.defaultTags ? helper.getValidTags(req.body.defaultTags) : [];

		const updateFields = { defaultTags };
		if (password) updateFields["password"] = password;

		if (email && email !== req.user.email) {
			const emailVerificationCode = uuid();
			updateFields["email"] = email;
			updateFields["emailVerificationCode"] = emailVerificationCode;
			await sendEmail.verificationEmail(req.user.username, email, emailVerificationCode);
		}

		await Users.updateOne({ _id: req.user._id }, { ...updateFields, lastUpdatedOn: new Date() });
		res.json({
			message: `Account updated. ${updateFields["emailVerificationCode"] ? "Please verify your email" : ""}`,
		});
	} catch (error) {
		next(error);
	}
};

const newApiKey = async (req, res, next) => {
	try {
		if (!req.user.userType === "paid") return helper.httpError(405, "This API cannot be used by free users");
		const apiKey = generateApiKey({ method: "uuidv4", dashes: false });

		await Users.updateOne({ _id: req.user._id }, { $push: { apiKeys: apiKey }, lastUpdatedOn: new Date() });

		res.json({ message: "API Key updated" });
	} catch (error) {
		next(error);
	}
};

const deleteApiKey = async (req, res, next) => {
	try {
		if (!req.user.userType === "paid") return helper.httpError(405, "This API cannot be used by free users");
		const apiKey = req.params.key;

		await Users.updateOne({ _id: req.user._id }, { $pull: { apiKeys: apiKey }, lastUpdatedOn: new Date() });

		res.json({ message: "API Key deleted" });
	} catch (error) {
		next(error);
	}
};

const updatePushCredentials = async (req, res, next) => {
	try {
		const credentials = req.body.credentials;

		await Users.findOneAndUpdate(
			{ _id: req.user._id, "devices.token": req.token },
			{
				$set: {
					"devices.$.pushCredentials": credentials,
				},
			}
		);
		res.json({ message: "Slap credentials updated" });
	} catch (error) {
		next(error);
	}
};

const addBookmark = async (req, res, next) => {
	try {
		if (req.user.emailVerificationCode) {
			return res.status(400).json({ message: "Please verify your email." });
		}

		const url = helper.getValidURL(req.body.url);
		let title = helper.sanitizeText(req.body.title);
		const tags = req.body.tags ? helper.getValidTags(req.body.tags) : [];

		// Check if this URL is bookmarked before
		let _url = await Bookmarks.findOne({ url, createdBy: req.user._id }).exec();
		if (_url) {
			return res.status(409).json({ message: "Bookmark already exist" });
		}

		if (!title) {
			title = title ?? url.slice(0, 30) + (url.length > 30 ? "..." : "");
			// Get title of the URL
			try {
				const rawHtmlContents = (await axios.get(url)).data;
				if (rawHtmlContents) {
					const htmlDocument = cheerio.load(rawHtmlContents);
					title = (htmlDocument("head title").text().trim() || title).substring(0, 160);
				}
			} catch (err) {
				// ignore this error and use the fallback title
			}
		}

		const newBookmark = await new Bookmarks({
			url,
			title,
			createdOn: new Date(),
			updatedOn: new Date(),
			createdBy: req.user._id,
			tags,
		}).save();

		res.json({ message: "Bookmark saved", _id: newBookmark._id });
	} catch (error) {
		next(error);
	}
};

const updateBookmark = async (req, res, next) => {
	try {
		if (req.user.emailVerificationCode) {
			return res.status(400).json({ message: "Please verify your email." });
		}

		const id = req.params.id;
		const title = (req.body.title ?? "").substring(0, 160);
		const tags = req.body.tags ? helper.getValidTags(req.body.tags) : [];

		let updateFields = { updatedOn: new Date() };
		if (title) updateFields = { ...updateFields, title };
		if (tags.length > 0) updateFields = { ...updateFields, tags };

		await Bookmarks.updateOne({ _id: id, createdBy: req.user._id }, updateFields);

		res.json({ message: `Bookmark updated` });
	} catch (error) {
		next(error);
	}
};

const deleteBookmark = async (req, res, next) => {
	try {
		const id = req.params.id;

		const result = await Bookmarks.deleteOne({ _id: id, createdBy: req.user._id });

		res.json({ message: "Bookmark deleted", result });
	} catch (error) {
		next(error);
	}
};

const removeMeFromTag = async (req, res, next) => {
	try {
		const id = req.params.id;

		await Bookmarks.updateOne({ _id: id }, { $pull: { tags: `@${req.user.username}` } });

		res.json({ message: "Removed your username from bookmark tags" });
	} catch (error) {
		next(error);
	}
};

const getBookmarks = async (req, res, next) => {
	try {
		const q = req.query.q;
		const tags = helper.getValidTags(req.query.tags ?? "");
		const skip = Number(req.query.skip) || 0;

		let query = { $or: [{ createdBy: req.user._id }, { tags: `@${req.user.username}` }] };

		if (q) query = { $and: [{ $or: query["$or"] }, { $text: { $search: q } }] };

		if (tags.length > 0) query = { ...query, tags: { $in: tags } };

		const bookmarks = await Bookmarks.find(query)
			.select("url title createdBy updatedOn tags")
			.skip(skip)
			.populate([{ path: "createdBy", select: "username" }])
			.limit(config.PAGE_LIMIT)
			.sort("-updatedOn")
			.exec();

		res.json({ bookmarks });
	} catch (error) {
		next(error);
	}
};

const getBookmark = async (req, res, next) => {
	try {
		const id = req.params.id;

		let query = { _id: id, createdBy: req.user._id };

		const bookmark = await Bookmarks.findOne(query)
			.select("url title createdBy createdOn updatedOn tags")
			.populate([{ path: "createdBy", select: "username" }])
			.exec();

		res.json({ bookmark });
	} catch (error) {
		next(error);
	}
};

const getTags = async (req, res, next) => {
	try {
		const bookmarkTags = await Bookmarks.find({
			createdBy: req.user._id,
			tags: { $exists: true, $not: { $size: 0 } },
		}).select("tags");

		const flatBookmarks = bookmarkTags.reduce((tags, bookmark) => [...tags, ...bookmark.tags], []);

		// tagMap holds an object with tag & no. of occurence.
		const tagMap = flatBookmarks.reduce((p, c) => {
			p[c] = (p[c] || 0) + 1;
			return p;
		}, {});

		// sorted array of tags
		const tags = Object.keys(tagMap)
			.sort((a, b) => tagMap[b] - tagMap[a])
			.reduce((tags, tag) => {
				tags[tag] = tagMap[tag];
				return tags;
			}, {});

		res.json({ tags });
	} catch (error) {
		next(error);
	}
};

const importBookmarks = async (req, res, next) => {
	try {
		if (!req.file) return helper.httpError(400, "Invalid file");

		const $ = cheerio.load(req.file.buffer.toString());
		const bookmarks = [];
		$("a").each((i, a) => {
			const bookmark = $(a);
			bookmarks.push({
				url: bookmark.attr("href"),
				title: bookmark.text(),
				createdOn: new Date(),
				updatedOn: new Date(),
				createdBy: req.user._id,
				tags: bookmark.attr("tags") || undefined,
			});
		});

		const response = await Bookmarks.insertMany(bookmarks);

		res.json({ message: `${response.length} bookmarks imported` });
	} catch (error) {
		next(error);
	}
};

const exportBookmarks = async (req, res, next) => {
	try {
		let query = { $or: [{ createdBy: req.user._id }, { tags: `@${req.user.username}` }] };

		const bookmarks = await Bookmarks.find(query)
			.select("url title createdOn updatedOn tags")
			.sort("-updatedOn")
			.exec();

		const bookmarkFileContents = helper.getBookmarkFileContents(bookmarks);

		let date = new Date().toISOString().split("T")[0];

		res.status(200).attachment(`currl-bookmarks-${date}.html`).send(bookmarkFileContents);
	} catch (error) {
		next(error);
	}
};

const logOut = async (req, res, next) => {
	try {
		await Users.updateOne({ _id: req.user._id }, { $pull: { devices: { token: req.token } } });
		req.session.destroy();
		res.json({ message: "Logged out" });
	} catch (error) {
		next(error);
	}
};

module.exports = {
	signUp,
	logIn,
	verifyEmail,
	resetPassword,
	me,
	updateAccount,
	newApiKey,
	deleteApiKey,
	updatePushCredentials,
	addBookmark,
	updateBookmark,
	deleteBookmark,
	removeMeFromTag,
	getBookmarks,
	getBookmark,
	getTags,
	importBookmarks,
	exportBookmarks,
	logOut,
};
