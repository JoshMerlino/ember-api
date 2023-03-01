/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
import { Request, Response } from "express";
import User from "../../src/auth/User";
import { query } from "../../src/mysql";

export const route = "details";

export default async function api(req: Request, res: Response): Promise<any> {

	// Get fields
	const body = { ...req.body, ...req.query };
	const fullurl = req.protocol + "://" + req.hostname + req.url;
	const { email } = body;

	// Check method
	if (req.method !== "POST") return res.status(405).json({
		success: false,
		message: "405 Method Not Allowed",
		description: `Method '${ req.method }' is not allowed on this endpoint.`
	});

	// Ensure getUser didnt reject the request
	if (res.headersSent) return;

	// Ensure Fields are there
	if (email === undefined || email === "") return res.status(406).json({
		success: false,
		message: "406 Not Acceptable",
		description: "Field 'email' is required but received 'undefined'.",
		readable: "Please enter an email address."
	});

	// Lookup user
	const [ userRow ] = await query<MySQLData.User>(`SELECT * FROM users WHERE email = "${ email?.toLowerCase() }"`);
	if (userRow === undefined) {
		return res.status(404).json({
			success: false,
			message: "404 Not Found",
			description: "Specified user does not exist.",
			readable: `'${ email.toLowerCase() }' is not a valid email address.`
		});
	}

	// Ensure getUser didnt reject the request
	if (res.headersSent) return;

	// Get user from id
	const user = await User.fromID(userRow.id);
	if (!user) return res.status(404).json({
		success: false,
		message: "404 Not Found",
		description: "Specified user does not exist.",
		readable: `'${ email.toLowerCase() }' is not a valid email address.`
	});

	res.json({
		...user.toSafe(),
		avatar_url: fullurl.replace(/\/details$/g, `/avatar/${ user.id }`),
		success: true
	});
}
