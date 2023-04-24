import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "ember/download-config";
export default async function api(req: Request, res: Response) {

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get host from request params
	const hash = req.query.hash ?? req.body.hash ?? req.query.config ?? req.body.config;

	// If host is not a string, return 400
	if (!hash) return rejectRequest(res, 400, "Missing key 'hash' in request.");

	// Attempt to connect to host
	try {

		// Get config
		const config = resolve("userdata/configs", `${ hash }.ovpn`);
		const raw = await readFile(config, "utf8");

		// Send config
		res.header("Content-Type", "application/x-openvpn-profile");
		res.header("Content-Disposition", `attachment; filename="${ hash.substring(0, 24) }.ovpn"`);
		return res.send(raw);

	} catch (error) {

		// If error, return 500
		console.error(error);
		return rejectRequest(res, 500);

	}

}
