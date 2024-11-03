const mongoStore = require("connect-mongo");
const session = require("express-session");
const router = require("express").Router();
const morgan = require("morgan");
const uuid = require("uuid").v4;

const config = require("./config");
const helper = require("./helper");

router.use(morgan("dev")); // for dev logging

router.use(
	session({
		secret: config.SECRET,
		store: mongoStore.create({ mongoUrl: config.MONGODB_URI }),
		cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
		resave: true,
		saveUninitialized: true,
	})
);

// Basic CSRF implementation
// TODO: Replace with other better npm packages if available
router.use((req, res, next) => {
	let csrfs = [...(req.session.csrfs ? req.session.csrfs : [])];
	const currentTimeInSeconds = new Date().getTime() / 1000;

	const csrfToken = uuid();
	csrfs.push({ token: csrfToken, expiry: currentTimeInSeconds + config.CSRF_TOKEN_EXPIRY });
	csrfs = csrfs.filter((csrf) => csrf.expiry > currentTimeInSeconds);

	req.session.csrfs = csrfs;
	req.csrfToken = csrfToken;
	next();
});

router.use(helper.attachUsertoRequest);

module.exports = router;
