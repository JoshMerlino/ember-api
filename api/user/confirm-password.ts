/* eslint @typescript-eslint/no-explicit-any: off */
/* eslint camelcase: off */
import { Request, Response } from "express";
import getAuthorization from "../../src/auth/getAuthorization";
import hash from "../../src/util/hash";
import User from "../../src/auth/User";

export const route = "v1/user/confirm-password";

export default async function api(req: Request, res: Response): Promise<any> {

	const body = { ...req.body, ...req.query };

	// Check method
	if (req.method !== "POST") return res.status(405).json({
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

	// Get user and 2fa status
	const user = await User.fromAuthorization(authorization);
	if (!user) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// Ensure getUser didnt reject the request
	if (res.headersSent) return;

	const { password } = body;

	if (password === undefined || password === "") return res.status(406).json({
		success: false,
		message: "406 Not Acceptable",
		description: "Field 'password' is required but received 'undefined'.",
		readable: "Please enter your password."
	});

	const checksum = hash(password);
	if (checksum === user.passwd_md5) return res.json({
		success: true,
		requested_checksum: checksum,
		local_checksum: user.passwd_md5
	});

	return res.status(400).json({
		success: false,
		message: "400 Bad Request",
		description: "Checksums do not match.",
		readable: "Password is incorrect.",
		requested_checksum: checksum,
		local_checksum: user.passwd_md5
	});

}
