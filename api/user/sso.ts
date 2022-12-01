/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
import { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { query } from "../../src/mysql";
import smtp from "../../src/smpt";
import { marked } from "marked";
import { readFile } from "fs/promises";
import path from "path";
import manifest from "../../package.json";
import snowflake from "../../src/util/snowflake";
import User from "../../src/auth/User";

export const route = "v1/user/sso";

export default async function api(req: Request, res: Response): Promise<any> {

	// Parse the request
	const body = { ...req.body, ...req.query };
	const fullurl = req.protocol + "://" + req.hostname + req.url;

	// Delete all expired sso tokens
	await query(`DELETE FROM sso WHERE expires_after < ${Date.now()};`);

	// If POST, create a new token
	if (req.method === "POST") {

		// Get email address
		const { email, redirect_uri = "/" } = body;

		// Ensure Fields are there
		if (email === undefined || email === "") return res.status(406).json({
			success: false,
			message: "406 Not Acceptable",
			description: "Field 'email' is required but received 'undefined'.",
			readable: "Please enter an email address."
		});

		// Get user associated with email address
		const [ user ] = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${email?.toLowerCase()}"`);

		if (user === undefined) {
			return res.status(404).json({
				success: false,
				message: "404 Not Found",
				description: "Specified user does not exist.",
				readable: `'${email.toLowerCase()}' is not a valid email address.`
			});
		}

		// Create SSO token & expiry time
		const sso = uuid();
		const expires_after = Date.now() + 1000*60*15;

		// Insert SSO token to database
		await query(`INSERT INTO sso (id, ssokey, user, expires_after) VALUES (${snowflake()}, "${sso}", ${user.id}, ${expires_after})`);

		const template = await readFile(path.resolve("./api/user/sso.md"), "utf8");

		// Render message
		const html = marked(template
			.replace(/%APPNAME%/g, manifest.name)
			.replace(/%SSOLINK%/g, `${fullurl}?token=${sso}&redirect_uri=${encodeURIComponent(redirect_uri)}`)
			.replace(/%USERNAME%/g, user.username));

		// Send message
		try {
			await smtp.sendMail({
				from: manifest.name,
				to: [ user.email ],
				subject: "Single-sign on link",
				html
			});
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "500 Internal Server Error",
				description: "Failed to send email.",
				error: process.env.DEVELOPMENT ? `${error}` : undefined
			});
		}

		return res.json({ success: true });

	}

	// If GET, verify token
	if (req.method === "GET") {

		const { token, redirect_uri } = req.query;

		const [ sso ] = await query<MySQLData.SSO>(`SELECT * FROM sso WHERE ssokey = "${token}";`);

		if (sso === undefined) res.status(401).json({
			success: false,
			message: "401 Unauthorized",
			description: "Invalid single-sign on token."
		});

		const user = await User.fromID(sso.user);
		if (!user) return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: "User deleted.",
			readable: "Your account has been deleted and can not be restored."
		});

		await query(`DELETE FROM sso WHERE ssokey = "${token}";`);

		// Set email verified flag on user
		user.setFlag(Auth.Flags.VERIFIED, true);

		// If their just confirming their email
		if (sso.prevent_authorization) return res.redirect(redirect_uri!.toString());

		// Generate session id
		const session_id = uuid();

		const now = Date.now();

		// Insert into sessions
		await query(`INSERT INTO sessions (id, session_id, user, md5, created_ms, last_used_ms, user_agent, ip_address) VALUES (${snowflake()}, "${session_id}", ${user.id}, "${user.passwd_md5}", ${now}, ${now}, "${req.header("User-Agent")}", "${req.ip}");`);

		// Set cookie
		res.cookie("session_id", session_id, { maxAge: 1000*60*60*24*3650 });
		res.header("authorization", session_id);

		return res.redirect(redirect_uri!.toString());

	}

	// Continue?
	if (res.headersSent) return;

	// Return 405
	return res.status(405).json({
		success: false,
		message: "405 Method Not Allowed",
		description: `Method '${req.method}' is not allowed on this endpoint.`
	});

}
