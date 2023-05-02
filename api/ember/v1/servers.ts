import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import User from "../../../src/auth/User";
import getAuthorization from "../../../src/auth/getAuthorization";
import { isAllowed } from "../../../src/ember/isAllowed";
import rejectRequest from "../../../src/util/rejectRequest";

// Create cache
const servers: Record<string, Ember.Server> = {};
setInterval(async function cache() {

	// Pull servers from file
	Object.values(JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8")) as Record<string, Ember.Server>)
		.map(server => servers[server.hash] = server);
	
}, 1000);

export const route = "ember/servers";
export default async function api(req: Request, res: Response): Promise<void | Response> {

	// Hold request until cache is ready
	if (!Object.keys(servers).length) {
		setTimeout(() => api(req, res), 10);
		return;
	}

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Filter servers that the user is allowed to see
	const usersServers: Record<string, Ember.Server> = {};
	for (const server of Object.values(servers)) {
		if (await isAllowed(server, user)) usersServers[server.hash] = server;
	}

	// Return servers
	return res.json({
		success: true,
		servers: Object.values(usersServers)
			.reduce((obj, server) => {
				obj[server.hash] = server;
				return obj;
			}, {} as Record<string, Ember.Server>)
	});

}
