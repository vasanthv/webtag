/**
 * A singleton implemetaion for the database collections
 */

const mongoose = require("mongoose");
const config = require("./config");

module.exports = (() => {
	let instance;
	let db = mongoose.connection;
	const Schema = mongoose.Schema;

	mongoose.set("strictQuery", true);

	const connectToDb = () => {
		mongoose.connect(config.MONGODB_URI);
	};

	const createInstance = () => {
		db.on("error", (error) => {
			console.error("Error in MongoDb connection: " + error);
			mongoose.disconnect(); // Trigger disconnect on any error
		});
		db.on("connected", () => console.log("Webtag DB connected"));
		db.on("disconnected", () => {
			console.log("MongoDB disconnected!");
			connectToDb();
		});

		connectToDb();

		console.log("Webtag DB initialized");

		const userSchema = new Schema({
			username: { type: String, index: true, required: true, unique: true, match: /^([a-zA-Z0-9]){1,18}$/ },
			email: { type: String, index: true, unique: true, required: true },
			password: { type: String, required: true },
			emailVerificationCode: { type: String, index: true },
			joinedOn: { type: Date, default: Date.now },
			lastLoginOn: Date,
			lastUpdatedOn: Date,
			devices: [
				// devices are actually browsers, that a user is authenticated on
				{
					token: { type: String, index: true }, // authentication token
					pushCredentials: Object, //  Push subscription data which includes push endpoint, token & auth credentials
					userAgent: { type: String },
				},
			],
			defaultTags: [{ type: String }],
			apiKeys: [{ type: String, index: true }],
		});

		const bookmarkSchema = new Schema({
			url: { type: String, index: true, required: true },
			title: String,
			createdOn: { type: Date, default: Date.now, index: true },
			updatedOn: { type: Date, default: Date.now, index: true },
			createdBy: { type: Schema.Types.ObjectId, ref: "Users", index: true },
			tags: [{ type: String, index: true }],
		});
		bookmarkSchema.index({ title: "text", url: "text" });

		const Users = mongoose.model("Users", userSchema);
		const Bookmarks = mongoose.model("Bookmarks", bookmarkSchema);

		return { Users, Bookmarks };
	};
	return {
		getInstance: () => {
			if (!instance) {
				instance = createInstance();
			}
			return instance;
		},
	};
})();
