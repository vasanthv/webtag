/* global axios, Vue */

const defaultState = function () {
	const queryParams = new URLSearchParams(window.location.search);
	const searchQuery = queryParams.get("q");
	return {
		page: "",
		registerValues: { username: "", email: "", password: "" },
		loginCreds: { username: "", password: "" },
		toast: { type: "", message: "", time: new Date().getTime() },
		bookmark: { url: "", tags: "", notes: "", isPrivate: false },
		editProfile: {},
		showLoadMore: false,
		searchQuery: searchQuery || "",
		showSearch: searchQuery ? searchQuery.length > 0 : false,
		disableSubmitButton: false,
		isProcessing: false,
	};
};

const App = Vue.createApp({
	data() {
		return defaultState();
	},
	computed: {
		prevPageLink() {
			let params = new URLSearchParams(window.location.search);
			const currentPage = params.get("page") ?? 1;
			params.set("page", +currentPage - 1);
			return `${window.location.pathname}?${params.toString()}`;
		},
		nextPageLink() {
			let params = new URLSearchParams(window.location.search);
			const currentPage = params.get("page") ?? 1;
			params.set("page", +currentPage + 1);
			return `${window.location.pathname}?${params.toString()}`;
		},
	},
	methods: {
		setToast(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 5000);
		},
		registerHandler(e) {
			e.preventDefault();
			if (!this.registerValues.username || !this.registerValues.email || !this.registerValues.password) {
				return this.setToast("All fields are mandatory");
			}
			axios({ url: e.target.action, method: e.target.method, data: this.registerValues }).then(() => {
				window.location.href = "/my";
			});
		},
		loginHandler(e) {
			e.preventDefault();
			if (!this.loginCreds.username || !this.loginCreds.password) {
				return this.setToast("Invalid credentials");
			}
			axios({ url: e.target.action, method: e.target.method, data: this.loginCreds }).then(() => {
				const urlParams = new URLSearchParams(window.location.search);
				console.log(urlParams.has("state"));
				console.log(urlParams.get("state"));
				if (urlParams.has("state")) {
					window.location.href = urlParams.get("state");
				} else {
					window.location.href = "/my";
				}
			});
		},
		forgotPasswordHandler() {
			if (!this.loginCreds.username) return this.setToast("Please enter the username");

			axios.post("/api/forgot", this.loginCreds).then(() => {});
		},
		editProfileHandler(e) {
			e.preventDefault();
			if (!this.editProfile.username) return this.setToast("Please enter a username");
			if (!this.editProfile.email) return this.setToast("Please enter an email");

			axios.put("/api/profile", this.editProfile).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		saveBookmarkHandler(e) {
			e.preventDefault();
			if (!this.bookmark.url) {
				return this.setToast("Invalid URL");
			}
			this.disableSubmitButton = true;
			axios({
				url: e.target.action,
				method: this.bookmark.id ? "put" : e.target.method,
				data: this.bookmark,
			})
				.then(() => {
					if (window.opener && window.opener !== window) {
						window.close();
					}
					window.location.href = "/my";
				})
				.finally(() => {
					this.disableSubmitButton = false;
				});
		},
		saveLinkHandler(e) {
			e.preventDefault();
			if (!this.isProcessing) {
				this.isProcessing = true;
				const isSave = e.target.text.trim() === "save";
				axios({
					url: "/api/bookmark",
					method: isSave ? "post" : "delete",
					data: { url: e.target.getAttribute("data-url") },
				})
					.then(() => {
						e.target.text = `${isSave ? "un" : ""}save`;
					})
					.finally(() => {
						this.isProcessing = false;
					});
			}
		},
		followLinkHandler(e) {
			e.preventDefault();
			if (!this.isProcessing) {
				this.isProcessing = true;
				const isFollowing = e.target.text.trim() === "unfollow";
				axios({
					url: "/api/follow",
					method: isFollowing ? "delete" : "post",
					data: { username: e.target.getAttribute("data-username") },
				})
					.then(() => {
						e.target.text = `${isFollowing ? "" : "un"}follow`;
					})
					.finally(() => {
						this.isProcessing = true;
					});
			}
		},
		handleExportBookmarks() {
			axios({
				url: "/api/bookmarks/export",
				method: "GET",
				responseType: "blob",
			}).then((response) => {
				const href = URL.createObjectURL(response.data);
				const link = document.createElement("a");
				link.href = href;
				link.setAttribute("download", "curl-bookmarks.html");
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(href);
			});
		},
		searchHandler() {
			const relativePath = window.location.pathname;
			const queryParams = new URLSearchParams(window.location.search);
			queryParams.delete("p");
			queryParams.delete("q");
			queryParams.append("q", this.searchQuery);
			window.location.href = `${relativePath}?${queryParams.toString()}`;
		},
		formatDate(datestring) {
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
		copyBookmarkletCode() {
			const code = document.getElementById("bookmarkletCode").textContent;
			navigator.clipboard.writeText(code).then(
				() => this.setToast("Code copied", "success"),
				(err) => console.error(err)
			);
		},
	},
}).mount("#app");

// init function
(() => {
	const csrfMetaTag = document.querySelector('meta[name="csrf-token"]');
	if (csrfMetaTag) {
		axios.defaults.headers.common["x-csrf-token"] = csrfMetaTag.getAttribute("content");
	}

	axios.interceptors.response.use(
		(response) => response,
		(error) => {
			console.log(error);
			App.setToast(error.response.data.message || "Something went wrong. Please try again");
			throw error;
		}
	);

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/sw.js");
	}
})();
