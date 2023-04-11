import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
export const route = "rsa/server-info";

export default async function api(req: Request, res: Response): Promise<any> {

	const accessMap: Record<string, string[]> = JSON.parse(await readFile(resolve("./userdata/accessMap.json"), "utf8"));

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	const hash = req.query.server ?? req.body.server;

	// Get server from servers
	const servers: Ember.Server[] = JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8"));
	const server = servers[hash];

	if (!servers.hasOwnProperty(hash)) return res.status(404).json({
		success: false,
		error: "404 Not Found",
		message: `Server '${ hash }' not found`
	});

	if (!accessMap[user.id].includes(hash)) return res.status(403).json({
		success: false,
		error: "403 Forbidden",
		message: `You are not allowed to access server '${ hash }'`
	});

	res.json({
		success: true,
		server
	});

}
