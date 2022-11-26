/* eslint @typescript-eslint/no-explicit-any: off */
import { Request, Response } from "express";
import idealPasswd from "ideal-password";
import { query } from "../../src/mysql";
import hash from "../../src/util/hash";
import snowflake from "../../src/util/snowflake";

export const route = "v1/user/create";

export default async function api(req: Request, res: Response): Promise<any> {

	const body = { ...req.body, ...req.query };

	// Make sure method is POST
	if (req.method !== "POST") return res.status(405).json({
		success: false,
		message: "405 Method Not Allowed",
		description: `Method '${req.method}' is not allowed on this endpoint. Use 'POST' instead.`
	});

	// Get fields
	const { username, email, password } = body;

	// Ensure Fields are there
	const requiredFields = [ "username", "email", "password" ];
	requiredFields.map(field => {
		if (!body.hasOwnProperty(field) || body[field] === "") return res.status(406).json({
			success: false,
			message: "406 Not Acceptable",
			description: `Field '${field}' is required but received 'undefined'.`,
			readable: `Please enter a ${field}.`
		});
	});

	// Continue?
	if (res.headersSent) return;

	// Generate password hash
	const md5 = hash(password);

	// Make sure email is an email address :/
	if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(email)) return res.status(406).json({
		success: false,
		message: "406 Not Acceptable",
		description: "Field 'email' expects type of 'EmailAddress' but received 'string'.",
		readable: `Email '${email.toLowerCase()}' is not a valid email address.`
	});

	// Select users with the same email address
	const users = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${email.toLowerCase()}";`);

	if (users.filter(user => user.email === email).length !== 0) {
		const [ user ] = users.filter(user => user.email === email.toLowerCase());

		// Respond with redirect to generate session
		if (md5 === user.passwd_md5) {
			res.redirect(307, "/api/v1/user/session");
			return;
		}

		return res.status(406).json({
			success: false,
			message: "406 Not Acceptable",
			description: "Field 'email' must be unique.",
			readable: `Email '${email.toLowerCase()}' is already being used. Did you mean to sign in?`
		});

	}

	// Continue?
	if (res.headersSent) return;

	// Determine password security
	const { entropy, legal } = idealPasswd(password);

	if (!legal) return res.status(406).json({
		success: false,
		message: "406 Not Acceptable",
		description: "'password' contains invalid characters.",
		password: "Please pick a new password."
	});

	if (password.length < 8) return res.status(406).json({
		success: false,
		message: "406 Not Acceptable",
		description: "'password' must be at least 8 characters in length.",
		readable: "Please choose a longer password. It must be at least 8 characters long."
	});

	if (entropy < 50) return res.status(406).json({
		success: false,
		message: "406 Not Acceptable",
		description: "'password' does not satify security requirements.",
		readable: "Please choose a different password. That one is insecure."
	});

	// Generate user ID
	const uuid = snowflake();

	// Get time for timestamp
	const now = Date.now();

	// Insert into database
	await query(`INSERT INTO users (id, username, email, passwd_md5, created_ms, passwd_length, passwd_changed_ms) VALUES (${uuid}, "${username}", "${email.toLowerCase()}", "${md5}", ${now}, ${password.length}, ${now});`);

	// Respond with redirect to generate session
	res.redirect(307, "/api/v1/user/session");

}
