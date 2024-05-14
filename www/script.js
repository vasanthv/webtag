/* global linkifyHtml, page, axios, Vue, cabin */

let swReg = null;
const urlB64ToUint8Array = (base64String) => {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
};

const initApp = async () => {
	if ("serviceWorker" in navigator) {
		swReg = await navigator.serviceWorker.register("/sw.js");

		navigator.serviceWorker.addEventListener("message", (event) => {
			if (!event.data.action) return;
			switch (event.data.action) {
				default:
					break;
			}
		});
	}
};

const defaultState = function () {
	const searchParams = new URLSearchParams(window.location.search);
	const sortOptions = [
		{ label: "Last updated date (asc)", value: "updatedOn" },
		{ label: "Last updated date (desc)", value: "-updatedOn" },
		{ label: "Created date (asc)", value: "createdOn" },
		{ label: "Created date (desc)", value: "-createdOn" },
		{ label: "Title (asc)", value: "title" },
		{ label: "Title (desc)", value: "-title" },
	];
	return {
		online: navigator.onLine,
		visible: document.visibilityState === "visible",
		loading: true,
		page: "",
		newAccount: { username: "", email: "", password: "" },
		authCreds: { username: "", password: "" },
		toast: [{ type: "", message: "" }],
		me: { username: "", email: "", password: "", defaultTags: "", publicTags: "" },
		myAccount: {},
		username: window.localStorage.username,
		bookmarks: [],
		tags: {},
		query: searchParams.get("q"),
		queryTags: searchParams.get("tags"),
		sortOptions,
		sort: window.localStorage.sort ?? "-updatedOn",
		newBookmark: { url: searchParams.get("url"), title: searchParams.get("title"), tags: window.localStorage.tags },
		updateBookmark: { id: "", url: "", title: "", tags: "" },
		showLoadMore: false,
		importFile: { file: null, tags: "" },
		pushSubscribed: window.localStorage.pushSubscribed === "true",
	};
};

const App = Vue.createApp({
	data() {
		return defaultState();
	},
	computed: {
		isloggedIn() {
			return !!this.username;
		},
		readUser() {
			if (!this.read.title) return "";
			return this.read.title.substr(1);
		},
		homeListClassName() {
			let className = "size";
			className += this.contacts.length < 8 ? "10" : this.contacts.length < 18 ? "20" : "50";
			return className;
		},
		tagsArray() {
			return Object.keys(this.tags).map((tag) => ({ tag, count: this.tags[tag] }));
		},
	},
	methods: {
		setNetworkStatus() {
			this.online = navigator.onLine;
		},
		setVisibility() {
			this.visible = document.visibilityState === "visible";
		},
		resetState() {
			const newState = defaultState();
			Object.keys(newState).map((key) => (this[key] = newState[key]));
		},
		setToast(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 3500);
		},
		userEvent(event) {
			if (cabin) cabin.event(event);
		},
		signUp() {
			if (!this.newAccount.username || !this.newAccount.email || !this.newAccount.password) {
				return this.setToast("All fields are mandatory");
			}
			axios.post("/api/signup", this.newAccount).then(this.authenticate);
			this.userEvent("signup");
		},
		signIn() {
			if (!this.authCreds.username || !this.authCreds.password) {
				return this.setToast("Please enter valid details");
			}
			axios.post("/api/login", this.authCreds).then(this.authenticate);
			this.userEvent("login");
		},
		forgotPassword() {
			if (!this.authCreds.username) {
				return this.setToast("Please enter your username");
			}
			axios.post("/api/reset", { username: this.authCreds.username }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		authenticate(response) {
			window.localStorage.username = this.username = response.data.username;
			this.newAccount = { username: "", email: "", password: "" };
			this.authCreds = { username: "", password: "" };
			page.redirect("/");
			this.setToast(response.data.message, "success");
		},
		getMe(queryParams = "") {
			axios.get(`/api/me${queryParams}`).then((response) => {
				window.localStorage.username = this.username = response.data.username;
				this.me = { ...this.me, ...response.data };
				this.myAccount = { ...this.me };
				window.localStorage.pushSubscribed = response.data.pushEnabled;
				this.pushSubscribed = response.data.pushEnabled;
				if (this.pushSubscribed) this.subscribeToPush();
				window.localStorage.tags = this.me.defaultTags.join(", ");
			});
		},
		updateAccount() {
			const { email, password, defaultTags, publicTags } = this.myAccount;
			axios
				.put("/api/account", {
					email,
					password,
					defaultTags: Array.isArray(defaultTags) ? defaultTags.join(",") : defaultTags,
					publicTags: Array.isArray(publicTags) ? publicTags.join(",") : publicTags,
				})
				.then((response) => {
					this.setToast(response.data.message, "success");
				});
		},
		getTags() {
			this.loading = true;
			axios
				.get("/api/tags")
				.then((response) => {
					this.tags = response.data.tags;
				})
				.finally(() => {
					this.loading = false;
				});
		},
		getBookmarks() {
			this.loading = true;
			const params = { q: this.query, tags: this.queryTags, sort: this.sort };
			if (this.bookmarks.length > 0) {
				params["skip"] = this.bookmarks.length;
			}
			axios
				.get("/api/bookmarks", { params })
				.then((response) => {
					if (response.data.bookmarks.length > 0) {
						response.data.bookmarks.forEach((m) => this.bookmarks.push(m));
					}
					this.showLoadMore = response.data.bookmarks.length == 50;
				})
				.finally(() => {
					this.loading = false;
				});
		},
		getBookmark(id) {
			axios.get(`/api/bookmarks/${id}`).then((response) => {
				if (response.data.bookmark) {
					this.updateBookmark = {
						...this.updateBookmark,
						...response.data.bookmark,
						tags: response.data.bookmark.tags.join(","),
					};
				}
			});
		},
		addBookmark() {
			axios.post("/api/bookmarks", { ...this.newBookmark }).then((response) => {
				this.setToast(response.data.message, "success");
				this.newBookmark = { tags: this.me.defaultTags.join(", "), url: "" };
				page.redirect("/");
			});
		},
		saveBookmark() {
			const { id, title, tags } = this.updateBookmark;
			axios.put(`/api/bookmarks/${id}`, { title, tags }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		removeMeFromTag(id) {
			axios.put(`/api/bookmarks/${id}/removeme`).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		searchSubmitHandler(e) {
			e.preventDefault();
			e.stopPropagation();
		},
		search() {
			const url = new URL(window.location);
			if (this.query) url.searchParams.set("q", this.query);
			else url.searchParams.delete("q");

			history.pushState({}, "", url);
			this.bookmarks = [];
			this.getBookmarks();
		},
		clearSearch() {
			// This method is used only when clearing the search box
			// as search event is not available in all browsers
			if (!this.query) {
				this.search();
			}
		},
		setSort(e) {
			window.localStorage.sort = e.target.value;
			this.bookmarks = [];
			this.getBookmarks();
		},
		deleteBookmark() {
			if (confirm("Are you sure, you want to delete this bookmark? There is no undo.")) {
				const { id } = this.updateBookmark;
				axios.delete(`/api/bookmarks/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					page.redirect("/");
				});
			}
		},
		setImportFile(e) {
			this.importFile.file = e.target.files[0];
		},
		importBookmarks() {
			const formData = new FormData();
			formData.append("bookmarks", this.importFile.file);
			formData.append("tags", this.importFile.tags);
			const headers = { "Content-Type": "multipart/form-data" };
			axios.post("/api/import", formData, { headers }).then((response) => {
				this.importFile = { file: null, tags: "" };
				document.getElementById("importFile").value = null;
				this.setToast(response.data.message, "success");
			});
		},
		exportBookmarks() {
			axios({
				url: "/api/export",
				method: "GET",
				responseType: "blob",
			}).then((response) => {
				const href = URL.createObjectURL(response.data);
				const link = document.createElement("a");
				const date = new Date().toISOString().split("T")[0];
				link.href = href;
				link.setAttribute("download", `webtag-bookmarks-${date}.html`);
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(href);
			});
		},
		async subscribeToPush() {
			if (swReg) {
				try {
					const vapidKey = (await axios.get("/api/meta")).data.vapidKey;
					if (vapidKey) {
						const pushSubscription = await swReg.pushManager.subscribe({
							userVisibleOnly: true,
							applicationServerKey: urlB64ToUint8Array(vapidKey),
						});
						const credentials = JSON.parse(JSON.stringify(pushSubscription));
						await axios.put("/api/account/pushcredentials", { credentials });
						window.localStorage.pushSubscribed = true;
						this.pushSubscribed = true;
					}
					return true;
				} catch (err) {
					console.log(err);
					if (this.page === "home") {
						this.setToast("Unable to enable notification, please try again.", "error");
					}
					return false;
				}
			}
		},
		disablePush() {
			axios.delete("/api/account/pushcredentials").then(() => {
				window.localStorage.pushSubscribed = false;
				this.pushSubscribed = false;
			});
		},
		togglePush(event) {
			if (event.target.checked) {
				this.subscribeToPush();
			} else {
				this.disablePush();
			}
		},
		displayTags(tags) {
			return tags
				.filter((t) => !!t)
				.map((tag) => (tag.startsWith("@") ? tag : `<a href="/?tags=${tag}">#${tag.substr(0, 26)}</a>`))
				.join(" ");
		},
		displayDate(datestring) {
			const seconds = Math.floor((new Date() - new Date(datestring)) / 1000);
			let interval = seconds / 31536000;
			if (interval > 1) return Math.floor(interval) + "Y";
			interval = seconds / 2592000;
			if (interval > 1) return Math.floor(interval) + "M";
			interval = seconds / 86400;
			if (interval > 1) return Math.floor(interval) + "d";
			interval = seconds / 3600;
			if (interval > 1) return Math.floor(interval) + "h";
			interval = seconds / 60;
			if (interval > 1) return Math.floor(interval) + "m";
			return "now";
		},

		logOut(autoSignOut) {
			const localClear = () => {
				window.localStorage.clear();
				this.resetState();
				page.redirect("/");
			};
			if (autoSignOut || confirm("Are you sure, you want to log out?")) axios.post("/api/logout").finally(localClear);
		},
		logError(message, source, lineno, colno) {
			const error = { message, source, lineno, colno, username: this.username, page: this.page };
			axios.post("/api/error", { error }).then(() => {});
			return true;
		},
	},
}).mount("#app");

window.addEventListener("online", App.setNetworkStatus);
window.addEventListener("offline", App.setNetworkStatus);
document.addEventListener("visibilitychange", App.setVisibility);
window.onerror = App.logError;

(() => {
	if (window.CSRF_TOKEN) {
		axios.defaults.headers.common["x-csrf-token"] = window.CSRF_TOKEN;
	}

	axios.interceptors.request.use((config) => {
		window.cancelRequestController = new AbortController();
		return { ...config, signal: window.cancelRequestController.signal };
	});

	axios.interceptors.response.use(
		(response) => response,
		(error) => {
			console.log(error);
			if (error.request.responseURL.endsWith("api/me") && error.response.status === 401) {
				return App.logOut(true);
			}
			App.setToast(error.response.data.message || "Something went wrong. Please try again");
			throw error;
		}
	);
	initApp();
})();

page("*", (ctx, next) => {
	// resetting state on any page load
	App.resetState();
	if (window.cancelRequestController) {
		window.cancelRequestController.abort();
	}
	if (App.isloggedIn) App.getMe();
	next();
});

/* Routes declaration */
page("/", (ctx) => {
	document.title = "Webtag - A free text-based bookmarking.";
	App.page = App.isloggedIn ? "home" : "intro";

	if (App.isloggedIn) {
		const urlParams = new URLSearchParams(ctx.querystring);
		App.query = urlParams.get("q");
		App.queryTags = urlParams.get("tags");
		App.getBookmarks();
	}
});

page("/signup", () => {
	document.title = "Sign up: Webtag";
	if (App.isloggedIn) return page.redirect("/");
	else App.page = "signup";
});

page("/login", () => {
	document.title = "Log in: Webtag";
	if (App.isloggedIn) return page.redirect("/");
	else App.page = "login";
});

page("/tags", () => {
	document.title = "My tags: Webtag";
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "tags";
	App.getTags();
});

page("/bookmark", () => {
	document.title = "New bookmark: Webtag";
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "newBookmark";
});

page("/edit", (ctx) => {
	document.title = "Edit bookmark: Webtag";
	if (!App.isloggedIn) return page.redirect("/login");
	const urlParams = new URLSearchParams(ctx.querystring);
	if (!urlParams.get("id")) return page.redirect("/");
	App.updateBookmark.id = urlParams.get("id");
	App.page = "editBookmark";
	App.getBookmark(App.updateBookmark.id);
});

page("/account", () => {
	document.title = "My acount: Webtag";
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "account";
	App.getMe();
});

page("/*", () => {
	document.title = "Page not found: Webtag";
	App.page = "404";
});

page();
