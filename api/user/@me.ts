/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
import { Request, Response } from "express";
import idealPasswd from "ideal-password";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import hash from "../../src/util/hash";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "auth/@me";

export default async function api(req: Request, res: Response): Promise<any> {

	// Get request body
	const body = { ...req.body, ...req.query };

	// Check method
	if ([ "GET", "PATCH", "DELETE", "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// If the method is used to modify the current user
	if (req.method === "PATCH") {

		// Get request body
		const { username, password, email } = body;

		// If change username
		if (username) {
			user.username = username;
			await query(`UPDATE users SET username = "${ username }" WHERE id = ${ user.id }`);
		}

		// If change email
		if (email) {

			// Validate email
			if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(email)) return rejectRequest(res, 406, `Email address '${ email }' is not a valid email address.`);

			// Check if email is already in use
			const users = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${ email.toLowerCase() }";`);
			if (users.filter(({ id }) => id !== user.id).length !== 0) return rejectRequest(res, 406, `Email address '${ email }' is already in use.`);

			// Update email
			user.email = email;
			await query(`UPDATE users SET email = "${ email }" WHERE id = ${ user.id }`);
			
		}

		// If change password
		if (password) {

			// Determine password security
			const { entropy, legal } = idealPasswd(password);

			// Password security requirements
			if (!legal) return rejectRequest(res, 406, "Password contains illegal characters.");
			if (password.length < 8) return rejectRequest(res, 406, "Password must be at least 8 characters long.");
			if (entropy < 50) return rejectRequest(res, 406, "That password is too weak, please pick another.");

			// Generate password hash
			const md5 = hash(password);

			// Update password
			user.passwd_md5 = md5;
			user.passwd_length = password.length;
			user.passwd_changed_ms = Date.now();
			await query(`UPDATE users SET passwd_md5 = "${ md5 }", passwd_length = ${ password.length }, passwd_changed_ms = ${ user.passwd_changed_ms } WHERE id = ${ user.id }`);
			
		}

	}

	// If the method is used to delete the current user
	if (req.method === "DELETE") {
		
		// TODO: Safer delete user
		await query(`DELETE FROM mfa WHERE user = '${ user.id }';`);
		await query(`DELETE FROM sessions WHERE user = '${ user.id }';`);
		await query(`DELETE FROM sso WHERE user = '${ user.id }';`);
		await query(`DELETE FROM users WHERE id = '${ user.id }';`);
		
		// Return the response
		return res.json({
			success: true,
			message: "User deleted."
		});

	}

	// Send response
	res.json({
		...user,
		success: true,
		avatar_url: req.url.replace(/@me$/g, `avatar/${ user.id }`)
	});

}
