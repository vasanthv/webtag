const express = require("express");
const path = require("path");

const config = require("./server/config");
const apiRoutes = require("./server/routes/api");
const middlewares = require("./server/middlewares");
const viewRoutes = require("./server/routes/views");

const app = express();
app.set("view engine", "ejs");

// Serve vue.js, page.js & axios to the browser
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));

// Serve frontend assets & images to the browser
app.use(express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(__dirname, "static/icons")));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 }));

app.use(middlewares);

app.use("/", viewRoutes);

app.use("/api", apiRoutes);

// Start the server
app.listen(config.PORT, null, function () {
	console.log("Node version", process.version);
	console.log("Webtag server running on port", config.PORT);
});
