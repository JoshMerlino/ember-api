import { Request, Response } from "express";
import { verifyToken } from "node-2fa";
import UAParser from "ua-parser-js";
import { v1 as uuid } from "uuid";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { sql } from "../../src/mysql";
import hash from "../../src/util/hash";
import rejectRequest from "../../src/util/rejectRequest";
import snowflake from "../../src/util/snowflake";

export const route = "auth/session";
export default async function api(req: Request, res: Response) {

	// Get body
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };

	// Make sure method is POST
	if (req.method === "POST") {

		// Get fields
		const { email, password, token, noredirect } = body;

		// Ensure Fields are there
		if (!email) return rejectRequest(res, 406, "Required field 'email' is missing.");
		if (!password) return rejectRequest(res, 406, "Required field 'password' is missing.");

		// Generate password hash
		const md5 = hash(password);

		// Select users with the same email address and password
		const users = await sql.unsafe<MySQLData.User[]>(
			"SELECT * FROM users WHERE email = $1 AND passwd_md5 = $2;",
			[ email, md5 ]
		);

		if (users.length === 0) return rejectRequest(res, 401, "Incorrect email or password.");

		// Get user from database
		const [ user ] = users;

		// Validate 2FA
		const [ mfa ] = await sql.unsafe<MySQLData.MFA[]>(
			"SELECT * FROM mfa WHERE \"user\" = $1",
			[ user.id ]
		);

		if (mfa !== undefined && mfa.pending === 0) {

			// If no token
			if (token === undefined || token.length === 0) return rejectRequest(res, 406, "Required field 'token' is missing.");

			// Verify token
			const verify = verifyToken(mfa.secret, token);
			if (verify === null || verify.delta !== 0) return rejectRequest(res, 401, "Invalid 2FA token.");

		}

		// Generate session id
		const now = Date.now();
		const session_id = uuid();

		// Insert into sessions
		await sql.unsafe(
			"INSERT INTO sessions (id, session_id, \"user\", md5, created_ms, last_used_ms, user_agent, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);",
			[
				snowflake(),
				session_id,
				user.id,
				md5,
				now,
				now,
				req.header("User-Agent") || "",
				req.ip
			]
		);

		// Set session
		res.cookie("session_id", session_id, { maxAge: 1000 * 60 * 60 * 24 * (body.hasOwnProperty("rememberme") ? 3650 : 7) });
		res.header("authorization", session_id);

		// Respond with redirect to generate session
		if (noredirect) return res.json({
			success: true,
			session_id
		});

		return res.redirect(307, "/v2/auth/@me");

	}

	// Make sure method is DELETE
	if (req.method === "DELETE") {

		// Get fields
		const authorization = body.authorization || body.session_id || getAuthorization(req);
		if (!authorization) return rejectRequest(res, 406, "Required field 'authorization' is missing.");

		// Get current session
		const [ session ] = await sql.unsafe<MySQLData.Session[]>(
			"SELECT * FROM sessions WHERE session_id = $1;",
			[ authorization ]
		);
		if (session === undefined) return rejectRequest(res, 401);

		// Delete from sessions
		await sql.unsafe(
			"DELETE FROM sessions WHERE session_id = $1",
			[ authorization ]
		);
		if ("all" in body) {
			await sql.unsafe(
				"DELETE FROM sessions WHERE \"user\" = $1",
				[ session.user ]
			);
		}

		// Delete cookie
		if (authorization === getAuthorization(req)) res.cookie("session_id", "", { maxAge: 0 });

		// Respond with session
		return res.json({ success: true });

	}

	// If trying to list all sessions
	if (req.method === "GET") {

		const authorization = getAuthorization(req);
		const user = authorization && await User.fromAuthorization(authorization);
		if (!authorization || !user) return rejectRequest(res, 401);

		// Get sessions
		const sessions = await sql.unsafe(
			"SELECT * FROM sessions WHERE \"user\" = $1",
			[ user.id ]
		).then(a => a.map(session => {
			session.current_session = session.session_id === authorization;
			delete session.md5;
			delete session.user;
			session.user_agent = new UAParser(session.user_agent as string).getResult();
			return session;
		}));

		// Respond with sessions
		return res.json({
			success: true,
			sessions
		});

	}

	// Return 405
	return rejectRequest(res, 405, `Method '${ req.method }' is not allowed.`);

}
