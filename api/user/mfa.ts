/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
/* eslint @typescript-eslint/no-var-requires: off */
import { Request, Response } from "express";
import { query } from "../../src/mysql";
import path from "path";
import { generateSecret, verifyToken } from "node-2fa";
import snowflake from "../../src/util/snowflake";

export const route = "v1/user/mfa";

export default async function api(req: Request, res: Response): Promise<any> {

	const { session_id } = req.cookies;

	// Make sure the request contains a session
	if (session_id === undefined) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// Get the full session
	const [ session ] = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE session_id = "${session_id}";`);
	if (session === undefined) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// Get user
	const [ user ] = await query<MySQLData.User>(`SELECT * FROM users WHERE id = ${session.user};`);
	if (user === undefined) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// If POST method
	if (req.method === "POST") {

		// Check to make sure user dosnt already have 2factor
		const [ mfa ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${user.id}`);
		if (mfa !== undefined && mfa.pending === 0) return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: "This account already has multifactor authentication enabled."
		});

		// Delete old MFA token
		if (mfa !== undefined) await query<MySQLData.MFA>(`DELETE FROM mfa WHERE user = ${user.id}`);

		// Generate secret
		const { secret, qr } = generateSecret({ name: require(path.resolve("./package.json")).name, account: user.email });

		// Insert into database
		await query(`INSERT INTO mfa (id, user, secret, pending) VALUES (${snowflake()}, ${user.id}, "${secret}", 1)`);

		// Send link to QR code
		return res.json({ qr });

	}

	// If DELETE method
	if (req.method === "DELETE") {

		// Check to make sure user dosnt already have 2factor
		const [ mfa ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${user.id}`);
		if (mfa === undefined || mfa.pending ===1) return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: "This account does not have multifactor authentication enabled."
		});

		// Remove 2fa
		await query<MySQLData.MFA>(`DELETE FROM mfa WHERE user = ${user.id}`);

		// Send link to QR code
		return res.json({ success: true });

	}

	// If PATCH method
	if (req.method === "PATCH") {

		// Check to make sure user dosnt already have 2factor
		const [ mfa ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${user.id}`);
		if (mfa !== undefined && mfa.pending === 0) return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: "This account already has multifactor authentication enabled."
		});

		// If not set up
		if (mfa === undefined) {
			return res.status(406).json({
				success: false,
				error: "406 Not Acceptable",
				description: "This account is not ready for multifactor authentication setup."
			});
		}

		// Ensure Fields are there
		if (!req.body.hasOwnProperty("token")) return res.status(406).json({
			success: false,
			message: "406 Not Acceptable",
			description: "Field 'token' is required but received 'undefined'."
		});

		// Verify token
		const { token } = req.body;
		const verify = verifyToken(mfa.secret, token);
		if (verify === null || verify.delta !== 0) return res.status(406).json({
			success: false,
			error: "406 Not Acceptable",
			description: "The token is not correct."
		});

		// If token is correct
		if (verify.delta === 0) {
			await query<MySQLData.MFA>(`UPDATE mfa SET pending = 0 WHERE user = ${user.id}`);
			return res.json({ success: true });
		}

		return res.json({ success: false });

	}

	// Continue?
	if (res.headersSent) return;

	return res.status(405).json({
		success: false,
		message: "405 Method Not Allowed",
		description: `Method '${req.method}' is not allowed on this endpoint.`
	});

}