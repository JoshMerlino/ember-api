import { Request, Response } from "express";
import { generateSecret, verifyToken } from "node-2fa";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { sql } from "../../src/mysql";
import rejectRequest from "../../src/util/rejectRequest";
import snowflake from "../../src/util/snowflake";

export const route = "auth/mfa";
export default async function api(req: Request, res: Response) {

	// Get fields
	const { token }: Record<string, string | undefined> = { ...req.body, ...req.query };

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// If POST method
	if (req.method === "POST") {

		// Check to make sure user dosnt already have 2factor
		const [ mfa ] = await sql.unsafe("SELECT * FROM mfa WHERE user = $1", [ user.id ]);

		if (mfa !== undefined && mfa.pending === 0) return rejectRequest(res, 406, "This account already has multifactor authentication enabled.");

		// Delete old MFA token
		if (mfa !== undefined) await sql.unsafe("DELETE FROM mfa WHERE user = $1", [ user.id ]);

		// Generate new secret
		const { secret, qr } = generateSecret({ name: "Ember VPN", account: user.email });
		await sql.unsafe("INSERT INTO mfa (id, user, secret, pending) VALUES ($1, $2, $3, 1)", [ snowflake(), user.id, secret ]);

		// Send link to QR code
		return res.json({
			success: true,
			qr: qr.replace(/chs=166x166/, "chs=164x164")
		});

	}

	// If DELETE method
	if (req.method === "DELETE") {

		// Check to make sure user dosnt already have 2factor
		const [ mfa ] = await sql.unsafe<Array<MySQLData.MFA>>("SELECT * FROM mfa WHERE user = $1", [ user.id ]);

		if (mfa === undefined || mfa.pending === 1) return rejectRequest(res, 406, "This account does not have multifactor authentication enabled.");

		// Remove 2fa
		await sql.unsafe("DELETE FROM mfa WHERE user = $1", [ user.id ]);

		// Send link to QR code
		return res.json({ success: true });

	}

	// If PATCH method
	if (req.method === "PATCH") {

		// Check to make sure user dosnt already have 2factor
		const [ mfa ] = await sql.unsafe<Array<MySQLData.MFA>>("SELECT * FROM mfa WHERE user = $1", [ user.id ]);
		if (mfa !== undefined && mfa.pending === 0) return rejectRequest(res, 406, "This account already has multifactor authentication enabled.");

		// If not set up
		if (mfa === undefined) return rejectRequest(res, 417, "You have not set up multifactor authentication yet.");

		// Ensure Fields are there
		if (token) return rejectRequest(res, 400, "Required field 'token' is missing.");

		// Check token
		const verify = verifyToken(mfa.secret, token);

		// If token is correct
		if (verify?.delta === 0) {
			await sql.unsafe("UPDATE mfa SET pending = 0 WHERE user = $1", [ user.id ]);
			return res.json({ success: true });
		}

		// If token is incorrect
		return rejectRequest(res, 406, "Invalid token.");

	}

	// Return 405
	return rejectRequest(res, 405, `Method '${ req.method }' is not allowed.`);

}
