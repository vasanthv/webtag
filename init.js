const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const path = require("path");
const app = express();

// Load emvironment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const config = require("./server/config");
const apiRoutes = require("./server/routes");

// Set the view engine
app.set("view engine", "ejs");

// Serve vue.js, page.js & axios to the browser
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/page/")));

// Serve frontend assets & images to the browser
app.use(express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(__dirname, "static/icons")));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 }));

// Handle API requests
app.use(morgan("dev")); // for dev logging

app.use("/api", apiRoutes);

// app.use(["/", "/read", "/signup", "/login", "/account", "/@:user/:list"], (req, res) =>
// 	res.sendFile(path.join(__dirname, "www/index.html"))
// );

app.use("/*", (req, res) => res.sendFile(path.join(__dirname, "www/index.html")));

// Start the server
app.listen(config.PORT, null, function () {
	console.log("Node version", process.version);
	console.log("Webtag server running on port", config.PORT);
});
