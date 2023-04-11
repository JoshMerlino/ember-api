/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
import { Request, Response } from "express";
import { verifyToken } from "node-2fa";
import UAParser from "ua-parser-js";
import { v1 as uuid } from "uuid";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import hash from "../../src/util/hash";
import snowflake from "../../src/util/snowflake";

export const route = "auth/session";

export default async function api(req: Request, res: Response): Promise<any> {

	// Parse the request
	const body = { ...req.body, ...req.query };

	// Make sure method is POST
	if (req.method === "POST") {

		// Get fields
		const { email, password, token, noredirect } = body;

		// Ensure Fields are there
		const requiredFields = [ "email", "password" ];
		requiredFields.map(field => {
			if (body[field] === undefined) return res.status(406).json({
				success: false,
				message: "406 Not Acceptable",
				description: `Field '${ field }' is required but received 'undefined'.`,
				readable: `Please enter a ${ field }.`
			});
		});

		// Continue?
		if (res.headersSent) return;

		// Generate password hash
		const md5 = hash(password);

		// Select users with the same email address and password
		const users = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${ email }" AND passwd_md5 = "${ md5 }";`);
		if (users.length === 0) return res.status(406).json({
			success: false,
			message: "406 Not Acceptable",
			description: "Fields 'email' or 'password' are invalid.",
			readable: "Incorrect password."
		});

		// Get user from database
		const [ user ] = users;

		// Validate 2FA
		const [ mfa ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${ user.id }`);
		if (mfa !== undefined && mfa.pending === 0) {

			// If no token
			if (token === undefined || token.length === 0) return res.status(417).json({
				success: false,
				message: "417 Expectation Failed",
				description: "This account requires further authentication."
			});

			// Verify token
			const verify = verifyToken(mfa.secret, token);
			if (verify === null || verify.delta !== 0) return res.status(406).json({
				success: false,
				error: "406 Not Acceptable",
				description: "The token is not correct.",
				readable: "Invalid token."
			});

		}

		// Generate session id
		const session_id = uuid();

		const now = Date.now();

		// Insert into sessions
		await query(`INSERT INTO sessions (id, session_id, user, md5, created_ms, last_used_ms, user_agent, ip_address) VALUES (${ snowflake() }, "${ session_id }", ${ user.id }, "${ md5 }", ${ now }, ${ now }, "${ req.header("User-Agent") }", "${ req.ip }");`);

		// Set cookie
		res.cookie("session_id", session_id, { maxAge: 1000 * 60 * 60 * 24 * (body.hasOwnProperty("rememberme") ? 3650 : 7) });
		res.header("authorization", session_id);

		// Respond with redirect to generate session
		if (noredirect) {
			res.json({
				success: true,
				session_id
			});
			return;
		}
		res.redirect(307, "./@me");
		return;

	}

	// Make sure method is DELETE
	if (req.method === "DELETE") {

		// Get fields
		const session_id = body.session_id || req.cookies.session_id;

		// Ensure Fields are there
		if (session_id === undefined) return res.status(406).json({
			success: false,
			message: "406 Not Acceptable",
			description: "Field 'session_id' is required but received 'undefined'."
		});

		// Continue?
		if (res.headersSent) return;

		// Get current session
		const [ session ] = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE session_id = "${ session_id }";`);

		if (session === undefined) return res.status(406).json({
			success: false,
			message: "406 Not Acceptable",
			description: `Session ID '${ session_id }' is not a valid session ID.`
		});

		if (res.headersSent) return;

		// Delete from sessions
		if (body.all === true) {
			await query(`DELETE FROM sessions WHERE user = ${ session.user }`);
		} else {
			await query(`DELETE FROM sessions WHERE session_id = "${ session_id }"`);
		}

		// Delete cookie
		if (session_id === getAuthorization(req)) res.cookie("session_id", "", { maxAge: 0 });

		// Respond with session
		return res.json({
			success: true
		});

	}

	// If trying to list all sessions
	if (req.method === "GET") {

		// Verify authorization
		const authorization = getAuthorization(req);
		if (authorization === undefined) return res.status(401).json({
			success: false,
			error: "401 Unauthorized",
			description: "You likley do not have a valid session token."
		});

		// Get user and 2fa status
		const user = await User.fromAuthorization(authorization);
		if (!user) return res.status(401).json({
			success: false,
			error: "401 Unauthorized",
			description: "You likley do not have a valid session token."
		});

		// Ensure getUser didnt reject the request
		if (res.headersSent) return;

		// Get sessions
		let sessions = await query(`SELECT * FROM sessions WHERE user = ${ user.id }`);
		sessions = sessions.map(session => {
			session.current_session = session.session_id === authorization;
			delete session.md5;
			delete session.user;
			session.user_agent = new UAParser(session.user_agent as string).getResult();
			return session;
		});

		// Respond with sessions
		res.json({ sessions });
		return;

	}

	// Respond with 405
	return res.status(405).json({
		success: false,
		message: "405 Method Not Allowed",
		description: `Method '${ req.method }' is not allowed on this endpoint.`
	});

}
