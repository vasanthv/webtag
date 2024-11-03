/**
 * Webtag Service worker
 */

const CACHE_NAME = "webtag-v-~VERSION";
const OFFLINE_URL = "/offline";

self.addEventListener("install", function (e) {
	console.log("Install event triggered. New updates available.");
	const filesToCache = ["/manifest.json", "/style.css", "/vue.global.prod.js", "/axios.min.js", "/script.js"];

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

self.addEventListener("push", function (event) {
	console.log("Push received", event);
	const rawPayload = event.data && event.data.text();

	const payload = rawPayload[0] === "{" ? JSON.parse(rawPayload) : rawPayload;

	if (payload.title) {
		const title = payload.title;
		const body = payload.body;
		const icon = "/icon.png";

		const data = { url: payload.url };

		event.waitUntil(self.registration.showNotification(title, { body, icon, data }));
	}
});

self.addEventListener("notificationclick", function (event) {
	console.log("Notification clicked", event);
	const urlToOpen = event.notification.data.url;
	event.waitUntil(self.clients.openWindow(urlToOpen));
});
