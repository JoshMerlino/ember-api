/* eslint @typescript-eslint/no-explicit-any: off */
import { Request, Response } from "express";
import { readFile } from "fs/promises";
import idealPasswd from "ideal-password";
import { marked } from "marked";
import path from "path";
import { v1, v4 } from "uuid";
import manifest from "../../package.json";
import { query } from "../../src/mysql";
import smtp from "../../src/smpt";
import hash from "../../src/util/hash";
import snowflake from "../../src/util/snowflake";

// FIXME - Clean up this file

export const route = "auth/create";
export default async function api(req: Request, res: Response): Promise<any> {

	const body = { ...req.body, ...req.query };
	const href = req.protocol + "://" + req.hostname + req.url;

	// Make sure method is POST
	if (req.method !== "POST") return res.status(405).json({
		success: false,
		error: "405 Method Not Allowed",
		description: `Method '${ req.method }' is not allowed on this endpoint. Use 'POST' instead.`
	});

	// Get fields
	const { username, email, password, noredirect } = body;

	// Ensure Fields are there
	const requiredFields = [ "username", "email", "password" ];
	requiredFields.map(field => {
		if (!body.hasOwnProperty(field) || body[field] === "") return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: `Field '${ field }' is required but received 'undefined'.`,
			readable: `Please enter a ${ field }.`
		});
	});

	// Continue?
	if (res.headersSent) return;

	// Generate password hash
	const md5 = hash(password);

	// Make sure email is an email address :/
	if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(email)) return res.status(406).json({
		success: false,
		error: "406 Not Acceptable",
		description: "Field 'email' expects type of 'EmailAddress' but received 'string'.",
		readable: `Email '${ email.toLowerCase() }' is not a valid email address.`
	});

	// Select users with the same email address
	const users = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${ email.toLowerCase() }";`);

	if (users.filter(user => user.email === email).length !== 0) {
		const [ user ] = users.filter(user => user.email === email.toLowerCase());

		// Respond with redirect to generate session
		if (md5 === user.passwd_md5) {

			if (noredirect) {

				// Generate session id
				const session_id = v1();

				const now = Date.now();

				// Insert into sessions
				await query(`INSERT INTO sessions (id, session_id, user, md5, created_ms, last_used_ms, user_agent, ip_address) VALUES (${ snowflake() }, "${ session_id }", ${ user.id }, "${ md5 }", ${ now }, ${ now }, "${ req.header("User-Agent") }", "${ req.ip }");`);

				res.json({
					success: true,
					session_id
				});
				return;
			}

			res.redirect(307, "./session");
			return;
		}

		return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: "Field 'email' must be unique.",
			readable: `Email '${ email.toLowerCase() }' is already being used. Did you mean to sign in?`
		});

	}

	// Continue?
	if (res.headersSent) return;

	// Determine password security
	const { entropy, legal } = idealPasswd(password);

	if (!legal) return res.status(406).json({
		success: false,
		error: "406 Not Acceptable",
		description: "'password' contains invalid characters.",
		password: "Please pick a new password."
	});

	if (password.length < 8) return res.status(406).json({
		success: false,
		error: "406 Not Acceptable",
		description: "'password' must be at least 8 characters in length.",
		readable: "Please choose a longer password. It must be at least 8 characters long."
	});

	if (entropy < 50) return res.status(406).json({
		success: false,
		error: "406 Not Acceptable",
		description: "'password' does not satify security requirements.",
		readable: "Please choose a different password. That one is insecure."
	});

	// Generate user ID
	const uuid = snowflake();

	// Get time for timestamp
	const now = Date.now();

	// Insert into database
	await query(`INSERT INTO users (id, username, email, passwd_md5, created_ms, passwd_length, passwd_changed_ms) VALUES (${ uuid }, "${ username }", "${ email.toLowerCase() }", "${ md5 }", ${ now }, ${ password.length }, ${ now });`);

	// Create SSO token & expiry time
	const sso = v4();
	const expires_after = Date.now() + 1000 * 60 * 15;

	// Insert SSO token to database
	await query(`INSERT INTO sso (id, ssokey, user, expires_after) VALUES (${ snowflake() }, "${ sso }", ${ uuid }, ${ expires_after })`);

	const template = await readFile(path.resolve("./api/user/create.md"), "utf8");

	// Render message
	const html = marked(template
		.replace(/%APPNAME%/g, manifest.name)
		.replace(/%SSOLINK%/g, `${ href }?token=${ sso }&redirect_uri=/verify-email-success`)
		.replace(/%USERNAME%/g, username));

	// Send message
	try {
		await smtp.sendMail({
			from: manifest.name,
			to: [ email.toLowerCase() ],
			subject: "Confirm email link",
			html
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "500 Internal Server Error",
			description: "Failed to send email.",
			error: process.env.DEVELOPMENT ? `${ error }` : undefined
		});
	}

	// Respond with redirect to generate session
	res.redirect(307, "./session");

}
