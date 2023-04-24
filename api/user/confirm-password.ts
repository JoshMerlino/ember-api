import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import hash from "../../src/util/hash";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "auth/confirm-password";
export default async function api(req: Request, res: Response) {
	
	// Check method
	if (req.method !== "POST") return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);
	
	// Get request body
	const { password }: Record<string, string | undefined> = { ...req.body, ...req.query };

	// Check if password is valid
	if (password === undefined || password === "") return rejectRequest(res, 400, "Password is required.");

	// Check if password is correct
	const checksum = hash(password);
	if (checksum === user.passwd_md5) return res.json({
		success: true,
		requested: checksum,
		local: user.passwd_md5
	});

	// Password is incorrect
	return rejectRequest(res, 401, "Password is incorrect.");

}
