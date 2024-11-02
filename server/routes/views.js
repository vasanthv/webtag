const router = require("express").Router();

const getViewProps = (req, title) => {
	let page = req.path.substr(1);
	if (!page) {
		page = req.user ? "bookmarks" : "intro";
	}

	return {
		page,
		user: req.user,
		title: title ?? "Webtag - A free bookmark manager",
		csrfToken: req.csrfToken,
	};
};

router.get("/", async (req, res) => {
	if (req.user) res.render("bookmarks", getViewProps(req));
	else res.render("intro", getViewProps(req));
});

router.get("/signup", async (req, res) => {
	if (req.user) res.render("bookmarks", getViewProps(req));
	res.render("signup", getViewProps(req, "Create an account - Webtag"));
});

router.get("/login", async (req, res) => {
	res.render("login", getViewProps(req, "Log in - Webtag"));
});

router.get("/tags", async (req, res) => {
	res.render("tags", getViewProps(req, "Tags - Webtag"));
});

router.get("/bookmark", async (req, res) => {
	res.render("bookmark-new", getViewProps(req, "Add new bookmark - Webtag"));
});

router.get("/edit", async (req, res) => {
	res.render("bookmark-edit", getViewProps(req, "Edit bookmark - Webtag"));
});

router.get("/account", async (req, res) => {
	res.render("account", getViewProps(req, "Account - Webtag"));
});

router.get("/bookmarklet", async (req, res) => {
	res.render("bookmarklet", getViewProps(req, "Bookmarklet - Webtag"));
});

router.get("/terms", async (req, res) => {
	res.render("terms", getViewProps(req, "Terms of service - Webtag"));
});

router.get("/contact", async (req, res) => {
	res.render("contact", getViewProps(req, "Contact - Webtag"));
});

router.get("/privacy", async (req, res) => {
	res.render("privacy", getViewProps(req, "Privacy policy - Webtag"));
});

router.get("/offline", async (req, res) => {
	res.render("offline", getViewProps(req, "You are offline - Webtag"));
});

router.get("/*", async (req, res) => {
	res.render("404", getViewProps(req, "Page not found - Webtag"));
});

module.exports = router;
