const express = require("express");
const morgan = require("morgan");
const path = require("path");
const app = express();

const config = require("./server/config");
const apiRoutes = require("./api/routes");
// const urlShortenerRoutes = require("./api/url-shortener");

// Serve vue.js, page.js & axios to the browser
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/page/")));

// Serve frontend assets & images to the browser
app.use(express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "static-pages")));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 }));

// Handle API requests
app.use(morgan("dev")); // for dev logging

app.use("/api", apiRoutes);

app.use(["/", "/read", "/signup", "/login", "/account", "/@:user/:list"], (req, res) =>
	res.sendFile(path.join(__dirname, "www/index.html"))
);

app.use("/*", (req, res) => res.sendFile(path.join(__dirname, "pages/404.html")));

// Start the server
app.listen(config.PORT, null, function () {
	console.log("Node version", process.version);
	console.log("Slap server running on port", config.PORT);
});
