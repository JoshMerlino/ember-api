/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
import { Request, Response } from "express";
import idealPasswd from "ideal-password";
import { query } from "../../src/mysql";
import getAuthorization from "../../src/auth/getAuthorization";
import hash from "../../src/util/hash";
import User from "../../src/auth/User";

export const route = "v1/user/@me";

export default async function api(req: Request, res: Response): Promise<any> {

	const body = { ...req.body, ...req.query };

	// Check method
	if (req.method !== "GET" && req.method !== "PATCH" && req.method !== "DELETE" && req.method !== "POST") return res.status(405).json({
		success: false,
		message: "405 Method Not Allowed",
		description: `Method '${req.method}' is not allowed on this endpoint.`
	});

	// Verify authorization
	const authorization = getAuthorization(req);
	if (authorization === undefined) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// Ensure getUser didnt reject the request
	if (res.headersSent) return;

	const user = await User.fromAuthorization(authorization);
	if (!user) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// If the method is used to modify the current user
	if (req.method === "PATCH") {

		const { username, password, email } = body;

		// If change username
		if (username) await query(`UPDATE users SET username = "${username}" WHERE id = ${user.id}`);

		// If change email
		if (email) {
			if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(email)) return res.status(406).json({
				success: false,
				message: "406 Not Acceptable",
				description: "Field 'email' expects type of 'EmailAddress' but received 'string'.",
				readable: `Email '${email.toLowerCase()}' is not a valid email address.`
			});
			const users = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${email.toLowerCase()}";`);
			if (users.filter(({ id }) => id !== user.id).length !== 0) {
				return res.status(406).json({
					success: false,
					message: "406 Not Acceptable",
					description: "Field 'email' must be unique.",
					readable: `Email '${email.toLowerCase()}' is already being used. Did you mean to sign in?`
				});
			}
			await query(`UPDATE users SET email = "${email}" WHERE id = ${user.id}`);
		}

		if (password) {
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

			// Generate password hash
			const md5 = hash(password);
			await query(`UPDATE users SET passwd_md5 = "${md5}", passwd_length = ${password.length}, passwd_changed_ms = ${Date.now()} WHERE id = ${user.id}`);
		}

		return res.json(await User.fromID(user.id));

	}

	if (req.method === "DELETE") {
		await query(`DELETE FROM mfa WHERE user = '${user.id}';`);
		await query(`DELETE FROM sessions WHERE user = '${user.id}';`);
		await query(`DELETE FROM sso WHERE user = '${user.id}';`);
		await query(`DELETE FROM users WHERE id = '${user.id}';`);
		return res.json({ success: true });
	}

	// Send response
	res.json(user);

}
