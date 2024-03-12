const fs = require("fs");
const path = require("path");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const { htmlToText } = require("html-to-text");
const Mustache = require("mustache");

const config = require("./config");

const verificationEmail = (username, email, code) => {
	const verificartionEmailLink = `${config.URL}api/verify/${code}`;

	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Please verify your email` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Please click on the link below to verify your email.<br/><a href="${verificartionEmailLink}" target='_blank'>${verificartionEmailLink}</a><br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nPlease click on the link below to verify your email.\n${verificartionEmailLink}\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

const resetPasswordEmail = (username, email, password) => {
	var params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Your password has been resetted.` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Your password to log in to your Webtag account is: <b>${password}</b><br/><br/>Note: Please change your password immediately after logging in.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nYour password to log in to Webtag account is: ${password}\n\nNote: Please change your password immediately after logging in.\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

const sendInviteEmail = (user, email) => {
	const emailBody = fs.readFileSync(path.join(__dirname, "../emails/invite-email.html")).toString();
	const emailHTML = Mustache.render(emailBody, { username: user.username });

	sendEmailFromHTMLBody(`[Webtag.io] ${user.username} has invited you to join Webtag.`, emailHTML, [{ email }]);
};

const sendEmailToUsers = (emailName, users) => {
	const emailBody = fs.readFileSync(path.join(__dirname, "../emails/" + emailName + ".html")).toString();

	const subject = emailBody.match(/<title>(.*?)<\/title>/g).map(function (val) {
		return val.replace(/<\/?title>/g, "");
	})[0];

	users.forEach((user) => {
		const emailHTML = Mustache.render(emailBody, user);
		sendEmailFromHTMLBody(subject, emailHTML, [user.email]);
	});
};

const sendEmailFromHTMLBody = (subject, emailHTML, recipients = []) => {
	recipients.forEach((email) => {
		const params = {
			Source: config.NO_REPLY_EMAIL,
			Destination: { ToAddresses: [email.email] },
			ReplyToAddresses: [config.CONTACT_EMAIL],
			Message: {
				Subject: { Charset: "UTF-8", Data: subject },
				Body: {
					Html: {
						Charset: "UTF-8",
						Data: emailHTML,
					},
					Text: {
						Charset: "UTF-8",
						Data: htmlToText(emailHTML),
					},
				},
			},
		};

		sendEmail(params);
	});
};

const sendEmail = async (params) => {
	const client = new SESClient({
		region: "us-west-2",
		credentials: {
			accessKeyId: config.AWS_ACCESS_KEY,
			secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
		},
	});
	const command = new SendEmailCommand(params);
	const response = await client.send(command);
	return response;
};

module.exports = { verificationEmail, resetPasswordEmail, sendInviteEmail, sendEmailToUsers, sendEmailFromHTMLBody };
