const mongoStore = require("connect-mongo");
const compression = require("compression");
const session = require("express-session");
const bodyParser = require("body-parser");
const uuid = require("uuid").v4;
const router = require("express").Router();

const config = require("./config");
const model = require("./model");
const helper = require("./helper");
const apiRoutes = require("./api");
const rssRoutes = require("./rss");

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

router.use(
	session({
		secret: config.SECRET,
		store: mongoStore.create({ mongoUrl: config.MONGO_URL }),
		cookie: { maxAge: 1000 * 60 * 60 * 24 * 14 },
		resave: true,
		saveUninitialized: true,
	})
);

router.use(compression());

router.use(async (req, res, next) => {
	let csrfs = [...(req.session.csrfs ? req.session.csrfs : [])];
	const currentTimeInSeconds = new Date().getTime() / 1000;

	const csrfToken = uuid();
	csrfs.push({ token: csrfToken, expiry: currentTimeInSeconds + 86400 });
	csrfs = csrfs.filter((csrf) => csrf.expiry > currentTimeInSeconds);

	req.session.csrfs = csrfs;
	req.csrfToken = csrfToken;
	next();
});

const redirectToLogin = (req, res, next) => {
	if (!req.user) return res.redirect(`/login?state=${req.originalUrl}`);
	next();
};

/* Views */
router.get("/", helper.attachLoggedInUser, async (req, res) => {
	if (req.user) return res.redirect("/my");
	const domain = req.query.domain;
	const tags = req.query.t;
	const bookmarks = await model.getPopularBookmarks(domain, tags);
	res.render("index", {
		title: "Currl - A social bookmarking website",
		pageTitle: "Currl",
		user: null,
		showIntro: true,
		hideSearch: true,
		bookmarks,
		domain,
		tags,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});
router.get("/register", helper.attachLoggedInUser, (req, res) => {
	if (req.user) return res.redirect("/my");
	res.render("register", { title: "Register: Currl", user: false, csrfToken: req.csrfToken });
});
router.get("/login", helper.attachLoggedInUser, (req, res) => {
	if (req.user) return res.redirect("/my");
	res.render("login", { title: "Log in: Currl", user: false, csrfToken: req.csrfToken });
});
router.get("/recent", helper.attachLoggedInUser, async (req, res) => {
	const q = req.query.q;
	const domain = req.query.domain;
	const tags = req.query.t;
	let query = {};
	if (q) query = { ...query, $or: [{ $text: { $search: q } }, { tags: { $in: q.split(" ") } }] };
	if (domain) query = { ...query, domain };
	if (tags) query = { ...query, tags: { $in: tags.split(",") } };
	const bookmarks = await model.getBookmarks(query, false, undefined, req.query.page, null);
	res.render("index", {
		title: "Recent: Currl",
		pageTitle: "Recent",
		user: req.user ?? null,
		bookmarks,
		domain,
		tags,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});

router.get("/popular", helper.attachLoggedInUser, async (req, res) => {
	const domain = req.query.domain;
	const tags = req.query.t;
	const bookmarks = await model.getPopularBookmarks(domain, tags);
	res.render("index", {
		title: "Popular: Currl",
		pageTitle: "Popular",
		user: req.user ?? null,
		bookmarks,
		domain,
		tags,
		hideSearch: true,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});
router.get("/my", helper.attachLoggedInUser, redirectToLogin, async (req, res) => {
	const q = req.query.q;
	const domain = req.query.domain;
	const tags = req.query.t;
	let query = { createdBy: req.user._id };
	if (q) query = { ...query, $or: [{ $text: { $search: q } }, { tags: { $in: q.split(" ") } }] };
	if (domain) query = { ...query, domain };
	if (tags) query = { ...query, tags: { $in: tags.split(",") } };
	const bookmarks = await model.getBookmarks(
		query,
		true,
		"url title tags domain createdBy createdOn notes isPrivate",
		req.query.page,
		req.user
	);
	res.render("index", {
		title: "My links: Currl",
		pageTitle: "My links",
		user: req.user,
		bookmarks,
		domain,
		tags,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});
router.get("/followings", helper.attachLoggedInUser, redirectToLogin, async (req, res) => {
	const q = req.query.q;
	const domain = req.query.domain;
	const tags = req.query.t;
	let query = { createdBy: req.user.follows };
	if (q) query = { ...query, $or: [{ $text: { $search: q } }, { tags: { $in: q.split(" ") } }] };
	if (domain) query = { ...query, domain };
	if (tags) query = { ...query, tags: { $in: tags.split(",") } };
	const bookmarks = await model.getBookmarks(query, false, undefined, req.query.page, req.user);
	res.render("index", {
		title: "Followings: Currl",
		pageTitle: "Followings",
		user: req.user,
		bookmarks,
		domain,
		tags,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});
router.get("/bookmark", helper.attachLoggedInUser, redirectToLogin, (req, res) => {
	res.render("bookmark", { title: "New bookmark: Currl", user: req.user, csrfToken: req.csrfToken, bookmark: null });
});
router.get("/bookmark/edit", helper.attachLoggedInUser, redirectToLogin, async (req, res) => {
	const bookmarkId = req.query.id;
	if (!req.user) return res.redirect("/login?state=/bookmark/edit?id=" + bookmarkId);

	const bookmark = await helper.getBookmarkById(bookmarkId, req.user);
	if (!bookmark) return res.status(404).send("Invalid bookmark");

	res.render("bookmark", { title: "Edit bookmark: Currl", user: req.user, csrfToken: req.csrfToken, bookmark });
});
router.get("/profile/edit", helper.attachLoggedInUser, redirectToLogin, async (req, res) => {
	res.render("settings", { title: "Edit profile: Currl", user: req.user ?? null, csrfToken: req.csrfToken });
});
router.get("/tags", helper.attachLoggedInUser, redirectToLogin, async (req, res) => {
	const tags = await model.getUserTags(req.user);
	res.render("tags", {
		title: "My tags: Currl",
		pageTitle: "My tags",
		user: req.user ?? null,
		csrfToken: req.csrfToken,
		tags: tags.tags,
	});
});
router.get("/logout", async (req, res) => {
	req.session.destroy(() => {
		res.redirect("/");
	});
});
router.get("/@:username", helper.attachLoggedInUser, async (req, res) => {
	const username = req.params.username.toLowerCase();
	const _user = await helper.getUserByUsername(username);
	if (!_user) {
		return res.status(404).send("Invalid username");
	}
	const q = req.query.q;
	const domain = req.query.domain;
	const tags = req.query.t;
	let query = { createdBy: _user._id };
	if (q) query = { ...query, $or: [{ $text: { $search: q } }, { tags: { $in: q.split(" ") } }] };
	if (domain) query = { ...query, domain };
	if (tags) query = { ...query, tags: { $in: tags.split(",") } };

	const { counts } = await model.getProfileCounts(_user);

	const bookmarks = await model.getBookmarks(query, false, undefined, req.query.page, req.user);
	res.render("index", {
		title: `${_user.username}: Currl`,
		pageTitle: `@${_user.username}`,
		user: req.user ?? null,
		profile: _user,
		bookmarks,
		domain,
		tags,
		counts,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});
router.get("/@:username/followers", helper.attachLoggedInUser, async (req, res) => {
	const username = req.params.username.toLowerCase();
	const _user = await helper.getUserByUsername(username);
	if (!_user) return res.status(404).send("Invalid username");

	const [counts, followers] = await Promise.all([
		model.getProfileCounts(_user),
		model.getFollowers(_user, req.query.page),
	]);

	res.render("follows", {
		title: `${_user.username}'s followers: Currl`,
		user: req.user ?? null,
		profile: _user,
		counts: counts.counts,
		follows: followers.followers,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});
router.get("/@:username/followings", helper.attachLoggedInUser, async (req, res) => {
	const username = req.params.username.toLowerCase();
	const _user = await helper.getUserByUsername(username);
	if (!_user) return res.status(404).send("Invalid username");

	const [counts, followings] = await Promise.all([
		model.getProfileCounts(_user),
		model.getFollowings(_user, req.query.page),
	]);

	res.render("follows", {
		title: `${_user.username}'s followings: Currl`,
		user: req.user ?? null,
		profile: _user,
		counts: counts.counts,
		follows: followings.followings,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});

/* Static pages */
router.get("/about", helper.attachLoggedInUser, (req, res) =>
	res.render("about", { title: "About: Currl", user: req.user ?? null })
);
router.get("/privacy", helper.attachLoggedInUser, (req, res) =>
	res.render("privacy", { title: "Privacy policy: Currl", user: req.user ?? null })
);
router.get("/rss", helper.attachLoggedInUser, (req, res) =>
	res.render("rss", { title: "RSS feeds: Currl", user: req.user ?? null })
);
router.get("/sponsors", helper.attachLoggedInUser, (req, res) =>
	res.render("sponsors", { title: "Sponsors: Currl", user: req.user ?? null })
);
router.get("/changelog", helper.attachLoggedInUser, (req, res) =>
	res.render("changelog", { title: "Changelog: Currl", user: req.user ?? null })
);

router.use("/api", apiRoutes);
router.use("/rss", rssRoutes);

router.use("/rss", rssRoutes);

/**
 * API endpoints common error handling middleware
 */
router.use(["/:404", "/"], (req, res) => {
	res.status(404).send("404: Page not found");
});

// Handle the known errors
router.use((err, req, res, next) => {
	if (err.httpErrorCode) {
		res.status(err.httpErrorCode).json(err.message || "Something went wrong");
	} else {
		next(err);
	}
});

// Handle the unknown errors
router.use((err, req, res) => {
	console.error(err);
	res.status(500).send(err.message || "Something went wrong");
});

module.exports = router;
