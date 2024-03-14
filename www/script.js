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
		query: "",
		queryTags: "",
		newBookmark: { url: "", tags: "" },
		updateBookmark: { id: "", url: "", title: "", tags: "" },
		showLoadMore: false,
		pushSubscribed: window.localStorage.pushSubscribed,
		read: {},
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
			if (!this.authCreds.username || !this.authCreds.password) {
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
			});
		},
		updateAccount() {
			axios.put("/api/account", { ...this.myAccount }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		getContacts() {
			axios.get("/api/contacts").then((response) => {
				this.contacts = response.data.contacts;
			});
		},
		getBlockedContacts() {
			axios.get("/api/contacts/blocked").then((response) => {
				this.blockedContacts = response.data.blocked;
			});
		},
		fetchProfile(username) {
			axios
				.get(`/api/profile/${username}`)
				.then((response) => {
					this.profile = response.data;
				})
				.catch((err) => {
					if (err.response.status === 404) {
						this.page = "404";
					}
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
		clearSlapText() {
			this.slapText = "";
			this.resetInputHeight();
		},
		resetInputHeight() {
			const textarea = document.querySelector("#pustTextBox textarea");
			if (this.slapText.length > 0) {
				textarea.style.height = textarea.scrollHeight + "px";
			} else {
				textarea.style.height = "auto";
			}
		},
		slapBtnHandler(username) {
			if (this.slapText) {
				username ? this.sendSlap(username, this.slapText) : this.sendSlapToAll(this.slapText);
			} else if (username) {
				this.sendSlap(username);
			} else {
				this.sendSlapToAll("");
			}
		},
		openQuickieDraw(username) {
			if (username) {
				this.slapUser = username;
			}
		},
		sendSlapToAll(text) {
			if (!this.isloggedIn) return this.setToast("Please log in.", "error");
			if (!text) return this.setToast("Empty text", "error");
			axios.post(`/api/slap/all`, { text }).then((response) => {
				this.setToast(response.data.message, "success");
				this.getContacts();
				this.clearSlapText();
			});
			this.userEvent("slap-all");
		},
		sendSlap(username, text) {
			if (!this.isloggedIn) return this.setToast("Please log in.", "error");
			axios.post(`/api/slap/@${username}`, { text }).then((response) => {
				this.setToast(response.data.message, "success");
				this.getContacts();
			});
			this.userEvent("slap");
		},
		clearSlapUser() {
			this.slapUser = "";
			window.history.pushState({}, document.title, "/");
		},
		addContact(identifier) {
			if (!this.isloggedIn) return this.setToast("Please log in.", "error");
			axios.post(`/api/contact/add`, { identifier }).then((response) => {
				this.setToast(response.data.message, "success");
				this.contactText = "";
				if (this.page === "home") this.getContacts();
				else if (this.page === "profile") this.fetchProfile(this.profile.username);
			});
			this.userEvent("addContact");
		},
		removeContact(username) {
			if (!this.isloggedIn) return this.setToast("Please log in.", "error");
			axios.post(`/api/contact/remove`, { username }).then((response) => {
				this.setToast(response.data.message, "success");
				if (this.page === "home") this.getContacts();
			});
		},
		blockContact(username) {
			if (!this.isloggedIn) return this.setToast("Please log in.", "error");
			axios.post(`/api/contact/block/@${username}`).then((response) => {
				this.setToast(response.data.message, "success");
				if (this.page === "home") this.getContacts();
				else if (this.page === "profile") this.fetchProfile(username);
			});
		},
		unblockContact(username) {
			if (!this.isloggedIn) return this.setToast("Please log in.", "error");
			axios.post(`/api/contact/unblock/@${username}`).then((response) => {
				this.setToast(response.data.message, "success");
				this.getBlockedContacts();
			});
		},
		inviteFriend() {
			axios.post("/api/invite", { email: this.inviteEmail }).then((response) => {
				this.setToast(response.data.message, "success");
				this.getMe("?invitees=true");
				this.inviteEmail = "";
			});
			this.userEvent("invite");
		},
		linkify: function (str) {
			if (!str) return "";
			return linkifyHtml(str, {
				attributes: {
					rel: "noopener noreferrer",
				},
				target: {
					url: "_blank",
				},
				formatHref: {
					mention: (href) => `@${href.substring(1)}`,
					// hashtag: (href) => href.substring(1),
				},
			});
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
	App.page = App.isloggedIn ? "home" : "intro";

	if (App.isloggedIn) {
		if (ctx.querystring) {
			const urlParams = new URLSearchParams(ctx.querystring);
			App.query = urlParams.get("q");
			App.tags = urlParams.get("tags");
		}
		App.getBookmarks();
	}
});

page("/signup", () => {
	if (App.isloggedIn) return page.redirect("/");
	else App.page = "signup";
});

page("/login", () => {
	if (App.isloggedIn) return page.redirect("/");
	else App.page = "login";
});

page("/tags", (ctx) => {
	console.log(ctx.querystring);
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "tags";
	App.fetchTags();
});

page("/bookmark", (ctx) => {
	console.log(ctx.querystring);
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "bookmark";
	App.fetchTags();
});

page("/@:username/public/:tag", (r) => {
	App.page = "publicTag";
	App.fetchPublicBookmarksByTag(r.params.username, r.params.tag);
});

page("/account", () => {
	if (!App.isloggedIn) return page.redirect("/login");
	App.page = "account";
	App.getMe();
});

page("/*", () => {
	App.page = "404";
});

page();
