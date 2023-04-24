import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "rsa/server-info";
export default async function api(req: Request, res: Response) {

	// TODO: Use MySQL to store server info
	// Get the access map
	const accessMap: Record<string, string[]> = JSON.parse(await readFile(resolve("./userdata/accessMap.json"), "utf8"));

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get the server id
	const { hash }: Record<string, string | undefined> = { ...req.body, ...req.query };
	if (!hash) return rejectRequest(res, 400, "Missing key 'hash' in request.");

	// Get server from servers
	const servers: Record<string, Ember.Server> = JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8"));
	const server = servers[hash];

	// Make sure the server exists and the user has access
	if (!servers.hasOwnProperty(hash)) return rejectRequest(res, 404, `Server with ID '${ hash }' not found.`);
	if (!accessMap[user.id].includes(hash)) return rejectRequest(res, 403, `You don't have access to server '${ hash }'.`);

	// Return the server
	res.json({
		success: true,
		server
	});

}
