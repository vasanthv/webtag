const mongoStore = require("connect-mongo");
const compression = require("compression");
const session = require("express-session");
const bodyParser = require("body-parser");
const uuid = require("uuid").v4;
const router = require("express").Router();

const config = require("./config");
const model = require("./model");
// const helper = require("./helper");
// const apiRoutes = require("./api");
// const rssRoutes = require("./rss");

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

router.use(
	session({
		secret: config.SECRET,
		store: mongoStore.create({ mongoUrl: config.MONGODB_URI }),
		cookie: { maxAge: 1000 * 60 * 60 * 24 * 15 },
		resave: true,
		saveUninitialized: true,
	})
);

// router.get("/verify/:code", model.verifyEmail);
// router.get("/meta", (req, res) => res.json({ vapidKey: config.PUSH_OPTIONS.vapidDetails.publicKey }));
// router.get("/users", model.getStats);
// router.post("/error", model.errorLog);

// // Basic CSRF implementation
// // TODO: Replace with other better npm packages if available
// router.get("/csrf.js", async (req, res) => {
// 	let csrfs = [...(req.session.csrfs ? req.session.csrfs : [])];
// 	const currentTimeInSeconds = new Date().getTime() / 1000;

// 	const csrfToken = uuid();
// 	csrfs.push({ token: csrfToken, expiry: currentTimeInSeconds + config.CSRF_TOKEN_EXPIRY });
// 	csrfs = csrfs.filter((csrf) => csrf.expiry > currentTimeInSeconds);

// 	req.session.csrfs = csrfs;
// 	res.send(`window.CSRF_TOKEN="${csrfToken}"`);
// });

/* Views */
router.get("/", async (req, res) => {
	// if (req.user) return res.redirect("/my");
	// const domain = req.query.domain;
	// const tags = req.query.t;
	// const bookmarks = await model.getPopularBookmarks(domain, tags);
	res.render("landing", {
		title: "Webtag - A free online bookmarking website",
		pageTitle: "Webtag",
		user: null,
		showIntro: true,
		hideSearch: true,
		// bookmarks,
		// domain,
		// tags,
		page: req.query.page ?? 1,
		csrfToken: req.csrfToken,
	});
});

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
