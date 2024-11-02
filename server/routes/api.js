const router = require("express").Router();
const bodyParser = require("body-parser");
const multer = require("multer");

const config = require("../config");
const model = require("../model");
const helper = require("../helper");

const upload = multer({ storage: multer.memoryStorage() });

// Username API requests
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

router.get("/verify/:code", model.verifyEmail);
router.get("/meta", (req, res) => res.json({ vapidKey: config.PUSH_OPTIONS.vapidDetails.publicKey }));
router.post("/error", (req, res) => {
	console.error({ browserError: req.body });
	res.send();
});

router.use(helper.csrfValidator);

router.post("/signup", helper.rateLimit({ windowMs: 30, max: 2, skipFailedRequests: true }), model.signUp);
router.post("/login", helper.rateLimit({ max: 5 }), model.logIn);
router.post("/reset", helper.rateLimit({ max: 5 }), model.resetPassword);

router.use(["/bookmarks/:id", "/bookmarks"], helper.attachUsertoRequestFromAPIKey);
router.use(helper.isUserAuthed);

router.put("/account", model.updateAccount);
router.put("/account/pushcredentials", model.updatePushCredentials);
router.delete("/account/pushcredentials", model.deletePushCredentials);
router.post("/key", model.newApiKey);
router.delete("/key/:key", model.deleteApiKey);
router.post("/logout", model.logOut);

router.get("/me", model.me);

router.post("/bookmarks", model.addBookmark);
router.put("/bookmarks/:id", model.updateBookmark);
router.delete("/bookmarks/:id", model.deleteBookmark);
router.put("/bookmarks/:id/removeme", model.removeMeFromTag);
router.get("/bookmarks", model.getBookmarks);
router.get("/bookmarks/:id", model.getBookmark);

router.post(
	"/import",
	helper.rateLimit({ windowMs: 60, max: 5, skipFailedRequests: true }),
	upload.single("bookmarks"),
	model.importBookmarks
);

router.get("/export", model.exportBookmarks);

router.get("/tags", model.getTags);

// Admin routes
// router.get("/sendemail", model.sendEmailToUsers);

/**
 * API endpoints common error handling middleware
 */
router.use(["/:404", "/"], (req, res) => {
	res.status(404).json({ message: "ROUTE_NOT_FOUND" });
});

// Username the known errors
router.use((err, req, res, next) => {
	if (err.httpErrorCode) {
		res.status(err.httpErrorCode).json({ message: err.message || "Something went wrong" });
	} else {
		next(err);
	}
});

// Username the unknown errors
router.use((err, req, res, next) => {
	console.error(err);
	res.status(500).json({ message: "Something went wrong" });
});

module.exports = router;
