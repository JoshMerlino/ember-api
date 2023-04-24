import { Request, Response } from "express";
import User from "../../../src/auth/User";
import { query } from "../../../src/mysql";
import rejectRequest from "../../../src/util/rejectRequest";
import { emailAddress } from "../../../src/util/validate";

export const route = "auth/details";
export default async function api(req: Request, res: Response) {

	// Get fields
	const { email }: Record<string, string | undefined> = { ...req.body, ...req.query };

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

	// Make sure email is valid
	if (!email) return rejectRequest(res, 400, "Required field 'email' is missing.");
	if (!emailAddress(email)) return rejectRequest(res, 406, `Email address '${ email }' is not a valid email address.`);

	// Lookup user by email
	const [ userRow ] = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${ email?.toLowerCase() }"`);
	if (userRow === undefined) return rejectRequest(res, 404, `User with email '${ email }' does not exist.`);

	// Get user from id
	const user = await User.fromID(userRow.id);
	if (!user) return rejectRequest(res, 500, "Failed to get user from id.");

	// Send response
	res.json({
		...user.toSafe(),
		avatar_url: req.url.replace(/\/details$/g, `/avatar/${ user.id }`),
		success: true
	});

}
