import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";

export const route = "ember/download-config";

export default async function api(req: Request, res: Response): Promise<void | Response> {

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		error: "Unauthorized",
		success: false
	});

	// Get host from request params
	const hash = req.query.hash ?? req.body.hash ?? req.query.config ?? req.body.config;

	// If host is not a string, return 400
	if (!hash) return res.status(400).json({
		error: "Missing config hash",
		success: false
	});

	// Attempt to connect to host
	try {
	
		const config = resolve("userdata/configs", `${ hash }.ovpn`);
		const raw = await readFile(config, "utf8");
		res.header("Content-Type", "application/x-openvpn-profile");
		res.header("Content-Disposition", `attachment; filename="${ hash.substring(0, 24) }.ovpn"`);
		res.send(raw);

	} catch (error) {
		res.status(500).json({
			error: (<Error>error).toString(),
			success: false
		});
	}

}