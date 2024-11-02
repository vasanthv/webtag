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
	console.log(req.user);
	if (req.user) res.render("bookmarks", getViewProps(req));
	else res.render("intro", getViewProps(req));
});

router.get("/signup", async (req, res) => {
	res.render("signup", getViewProps(req, "Create an account - Webtag"));
});

router.get("/login", async (req, res) => {
	res.render("login", getViewProps(req, "Log in - Webtag"));
});

module.exports = router;
