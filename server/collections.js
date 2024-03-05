/**
 * A singleton implemetaion for the database collections
 */

const mongoose = require("mongoose");
const config = require("../config");

module.exports = (() => {
	let instance;
	let db = mongoose.connection;
	const Schema = mongoose.Schema;

	mongoose.set("strictQuery", true);

	const connectToDb = () => {
		mongoose.connect(config.MONGODB_URI, {
			useNewUrlParser: true,
		});
	};

	const createInstance = () => {
		db.on("error", (error) => {
			console.error("Error in MongoDb connection: " + error);
			mongoose.disconnect(); // Trigger disconnect on any error
		});
		db.on("connected", () => console.log("Atomate DB connected"));
		db.on("disconnected", () => {
			console.log("MongoDB disconnected!");
			connectToDb();
		});

		connectToDb();

		console.log("Onlie DB initialized");

		const userSchema = new Schema({
			email: { type: String, index: true, unique: true, required: true },
			password: { type: String, required: true },
			name: String,
			website: String,
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
		});

		const listSchema = new Schema({
			name: String,
			isPublic: Boolean,
			createdOn: { type: Date, default: Date.now },
			updatedOn: Date,
			members: [{ type: Schema.Types.ObjectId, ref: "Users", index: true }],
			emails: [{ type: String, index: true }],
			pushSubscribers: [{ type: Schema.Types.ObjectId, ref: "Users", index: true }],
		});

		const bookmarkSchema = new Schema({
			url: { type: String, index: true },
			title: String,
			createdOn: { type: Date, default: Date.now, index: true },
			updatedOn: { type: Date, default: Date.now, index: true },
			updatedBy: { type: Schema.Types.ObjectId, ref: "Users", index: true },
			createdBy: { type: Schema.Types.ObjectId, ref: "Users", index: true },
			domain: { type: String, index: true },
			notes: String,
			tags: [{ type: String, index: true }],
			list: { type: Schema.Types.ObjectId, ref: "Lists", index: true },
			textContent: String,
			readableContent: String,
		});
		bookmarkSchema.index({ title: "text", notes: "text", textContent: "text" });

		const Users = mongoose.model("Users", channelSchema);
		const Lists = mongoose.model("Lists", listSchema);
		const Bookmarks = mongoose.model("Bookmarks", bookmarkSchema);

		return { Users, Lists, Bookmarks };
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
