import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { marked } from "marked";
import path from "path";
import { v4 as uuid } from "uuid";
import manifest from "../../package.json";
import User from "../../src/auth/User";
import { query } from "../../src/mysql";
import smtp from "../../src/smpt";
import rejectRequest from "../../src/util/rejectRequest";
import snowflake from "../../src/util/snowflake";
import { emailAddress } from "../../src/util/validate";

// FIXME - Clean up this file

export const route = "auth/sso";
export default async function api(req: Request, res: Response) {

	// Parse the request
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };
	const fullurl = req.protocol + "://" + req.hostname + req.url;

	// Delete all expired sso tokens
	await query(`DELETE FROM sso WHERE expires_after < ${ Date.now() };`);

	// If POST, create a new token
	if (req.method === "POST") {

		// Get email address
		const { email, redirect_uri = "/" } = body;

		// Ensure Fields are there
		if (!email) return rejectRequest(res, 406, "Required field 'email' is missing.");
		if (!emailAddress(email)) return rejectRequest(res, 406, `Email '${ email.toLowerCase() }' is not a valid email address.`);

		// Lookup user by email
		const [ userRow ] = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${ email?.toLowerCase() }"`);
		if (userRow === undefined) return rejectRequest(res, 404, `User with email '${ email }' does not exist.`);

		// Get user from id
		const user = await User.fromID(userRow.id);
		if (!user) return rejectRequest(res, 500, "Failed to get user from id.");

		// Create SSO token & expiry time
		const sso = uuid();
		const expires_after = Date.now() + 1000 * 60 * 15;

		// Insert SSO token to database
		await query(`INSERT INTO sso (id, ssokey, user, expires_after) VALUES (${ snowflake() }, "${ sso }", ${ user.id }, ${ expires_after })`);

		// Render message
		const html = marked((await readFile(path.resolve("./api/user/sso.md"), "utf8"))
			.replace(/%APPNAME%/g, manifest.name)
			.replace(/%SSOLINK%/g, `${ fullurl }?token=${ sso }&redirect_uri=${ encodeURIComponent(redirect_uri) }`)
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

			// Error sending email
			console.error(error);
			return rejectRequest(res, 500, "Failed to send email.");

		}

		// Return success
		return res.json({ success: true });

	}

	// If GET, verify token
	if (req.method === "GET") {

		// Get token and redirect
		const { token, redirect_uri } = body;

		// Locate token
		const [ sso ] = await query<MySQLData.SSO>(`SELECT * FROM sso WHERE ssokey = "${ token }";`);

		// If no token found
		if (sso === undefined) return rejectRequest(res, 404, "SSO token not found.");

		const user = await User.fromID(sso.user);
		if (!user) return rejectRequest(res, 500, "Failed to get user from id.");

		// Delete token
		await query(`DELETE FROM sso WHERE ssokey = "${ token }";`);

		// Set email verified flag on user
		user.setFlag(Auth.Flags.VERIFIED, true);

		// If their just confirming their email
		if (sso.prevent_authorization) return res.redirect(redirect_uri?.toString() ?? "/");

		// Generate session id
		const now = Date.now();
		const session_id = uuid();

		// Insert into sessions
		await query(`INSERT INTO sessions (id, session_id, user, md5, created_ms, last_used_ms, user_agent, ip_address) VALUES (${ snowflake() }, "${ session_id }", ${ user.id }, "${ user.passwd_md5 }", ${ now }, ${ now }, "${ req.header("User-Agent") }", "${ req.ip }");`);

		// Set cookie
		res.cookie("session_id", session_id, { maxAge: 1000 * 60 * 60 * 24 * 3650 });
		res.header("authorization", session_id);

		// Redirect
		return res.redirect(redirect_uri?.toString() ?? "/");

	}

	// Return 405
	return res.status(405).json({
		success: false,
		error: "405 Method Not Allowed",
		description: `Method '${ req.method }' is not allowed on this endpoint.`
	});

}
