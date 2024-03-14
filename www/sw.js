/**
 * Slap Service worker
 */

const currentCacheName = "slap-v-~VERSION";

self.addEventListener("install", function (e) {
	console.log("Install event triggered. New updates available.");
	const filesToCache = [
		"/",
		"/manifest.json",
		"/style.css",
		"/vue.global.prod.js",
		"/linkify.min.js",
		"/axios.min.js",
		"/page.js",
		"/script.js",
		"/index.html",
		"/about.html",
		"/terms.html",
		"/privacy.html",
		"/signup",
		"/login",
		"/read",
		"/account",
		"/blocked",
	];

	// Deleting the previous version of cache
	e.waitUntil(
		caches.keys().then(function (cacheNames) {
			return Promise.all(cacheNames.filter((cacheName) => cacheName != currentCacheName).map((cacheName) => caches.delete(cacheName)));
		})
	);

	// add the files to cache
	e.waitUntil(
		caches.open(currentCacheName).then(function (cache) {
			return cache.addAll(filesToCache);
		})
	);
});

self.addEventListener("fetch", function (event) {
	event.respondWith(
		caches
			.match(event.request)
			.then(function (cache) {
				return cache || fetch(event.request);
			})
			.catch((err) => {})
	);
});

self.addEventListener("push", function (event) {
	console.log("Push received", event);
	const rawPayload = event.data && event.data.text();

	const payload = rawPayload[0] === "{" ? JSON.parse(rawPayload) : rawPayload;

	if (payload.title) {
		const title = `${payload.title} slapped you`;
		const body = payload.body;
		const icon = "/icon.png";

		const data = { url: payload.url, appURL: payload.appURL };

		event.waitUntil(self.registration.showNotification(title, { body, icon, data }));
	}
});

self.addEventListener("notificationclick", function (event) {
	console.log("Notification clicked", event);
	const urlToOpen = event.notification.data.url;
	event.waitUntil(self.clients.openWindow(urlToOpen));
});
