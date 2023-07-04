/* eslint @typescript-eslint/no-explicit-any: off */
import { Request, Response } from "express";
import { readFile } from "fs/promises";
import idealPasswd from "ideal-password";
import { marked } from "marked";
import path from "path";
import { v1, v4 } from "uuid";
import { sql } from "../../src/mysql";
import { resend } from "../../src/resend";
import hash from "../../src/util/hash";
import rejectRequest from "../../src/util/rejectRequest";
import snowflake from "../../src/util/snowflake";
import { emailAddress } from "../../src/util/validate";

export const route = "auth/create";
export default async function api(req: Request, res: Response): Promise<any> {

	// Parse the request
	const fullurl = req.protocol + "://" + req.hostname + req.url;
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

	// Get fields
	const { username, email, password, noredirect } = body;

	// Ensure Fields are there
	if (!username) return rejectRequest(res, 406, "Required field 'username' is missing.");
	if (!email) return rejectRequest(res, 406, "Required field 'email' is missing.");
	if (!emailAddress(email)) return rejectRequest(res, 406, `Email '${ email.toLowerCase() }' is not a valid email address.`);
	if (!password) return rejectRequest(res, 406, "Required field 'password' is missing.");

	// Generate password hash
	const md5 = hash(password);

	// Select users with the same email address
	const users = await sql.unsafe<MySQLData.User[]>("SELECT * FROM users WHERE email = $1;", [ email.toLowerCase() ]);

	// Check if user exists & get that user
	if (users.filter(user => user.email === email).length !== 0) {
		const [ user ] = users.filter(user => user.email === email.toLowerCase());

		// See if the password is correct
		if (md5 === user.passwd_md5) {

			// Passivly generate session without redirect
			if (noredirect) {

				// Generate session id
				const session_id = v1();
				const now = Date.now();

				// Insert into sessions
				await sql.unsafe(
					"INSERT INTO sessions (session_id, \"user\", md5, created_ms, last_used_ms, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5, $5, $6);", [
						session_id,
						user.id,
						md5,
						now,
						req.header("User-Agent") || "",
						req.ip
					]);

				// Respond with session id
				return res.json({
					success: true,
					session_id
				});
			}

			// Redirect to login
			return res.redirect(307, "./session");

		}

		// Respond with error
		return rejectRequest(res, 406, `Email '${ email.toLowerCase() }' is already in use.`);

	}

	// Determine password security
	const { entropy, legal } = idealPasswd(password);

	// Check password security
	if (!legal) return rejectRequest(res, 406, "Password contains illegal characters.");
	if (password.length < 8) return rejectRequest(res, 406, "Password must be at least 8 characters in length.");
	if (entropy < 50) return rejectRequest(res, 406, "Password does not satify security requirements.");

	// Generate user ID
	const uuid = snowflake();
	const now = Date.now();
	const sso = v4();
	const expires_after = now + 1000 * 60 * 15;

	// Insert into database
	await sql.unsafe(
		"INSERT INTO users (id, username, email, passwd_md5, created_ms, passwd_length, passwd_changed_ms) VALUES ($1, $2, $3, $4, $5, $6, $7);",
		[ uuid, username, email.toLowerCase(), md5, now, password.length, now ]
	);

	// Insert SSO token to database
	await sql.unsafe(
		"INSERT INTO sso (ssokey, \"user\", expires_after) VALUES ($1, $2, $3);",
		[ sso, uuid, expires_after ]
	);

	// Render message
	const html = marked((await readFile(path.resolve("./api/user/create.md"), "utf8"))
		.replace(/%APPNAME%/g, "Ember VPN")
		.replace(/%SSOLINK%/g, `${ fullurl }?token=${ sso }&redirect_uri=${ encodeURIComponent("https://embervpn.org/") }`)
		.replace(/%USERNAME%/g, username));

	// Send message
	try {
		resend.emails.send({
			from: "noreply@embervpn.org",
			to: email,
			subject: "Confirm your email address",
			html
		});
	} catch (error) {

		// Error sending email
		console.error(error);
		return rejectRequest(res, 500, "Failed to send email.");

	}

	// Respond with redirect to generate session
	if (noredirect) return res.json({ success: true });

	// Redirect to login
	return res.redirect(307, "./session");

}
