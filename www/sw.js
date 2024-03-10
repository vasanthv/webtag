/**
 * Currl Service worker
 */

const CACHE_NAME = "currl-v-~VERSION";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", function (e) {
	console.log("Install event triggered. New updates available.");
	const filesToCache = [
		"/favicon.ico",
		"/favicon.svg",
		"/manifest.json",
		"/style.css",
		"/vue.global.prod.js",
		"/axios.min.js",
		"/script.js",
		"/icomoon/style.css",
		"/icomoon/fonts/icomoon.ttf",
		"/icomoon/fonts/icomoon.eot",
		"/icomoon/fonts/icomoon.svg",
		"/icomoon/fonts/icomoon.woff",
		"/offline.html",
	];

	// Deleting the previous version of cache
	e.waitUntil(
		caches.keys().then(function (cacheNames) {
			return Promise.all(
				cacheNames.filter((cacheName) => cacheName != CACHE_NAME).map((cacheName) => caches.delete(cacheName))
			);
		})
	);

	// add the files to cache
	e.waitUntil(
		caches.open(CACHE_NAME).then(function (cache) {
			return cache.addAll(filesToCache);
		})
	);
});

const cacheFirst = async (event) => {
	try {
		const responseFromCache = await caches.match(event.request);
		if (responseFromCache) return responseFromCache;

		const liveResponse = await fetch(event.request);
		return liveResponse;
	} catch (err) {
		console.log(err);
		if (event.request.mode === "navigate") {
			const cache = await caches.open(CACHE_NAME);
			const cachedResponse = await cache.match(OFFLINE_URL);
			return cachedResponse;
		}
	}
};

self.addEventListener("fetch", function (event) {
	event.respondWith(cacheFirst(event));
});
