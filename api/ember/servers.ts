import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { inetLatency } from "systeminformation";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { isAllowed } from "../../src/ember/isAllowed";

export const route = "ember/servers";

let servers: Record<string, Ember.Server> | undefined = {};

setInterval(() => servers = undefined, 1000 * 5);

export const ping = (server: Ember.Server) => new Promise<false | number>(resolve => {
	inetLatency(server.ip).then(resolve).catch(() => resolve(false));
	setTimeout(() => resolve(false), 1000);
});

export default async function api(req: Request, res: Response): Promise<void | Response> {
	
	servers = servers || JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8")) as Record<string, Ember.Server>;

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		error: "Unauthorized",
		success: false
	});

	const usersServers: Record<string, Ember.Server> = {};
	for (const server of Object.values(servers)) {
		if (await isAllowed(server, user)) {
			const ms = await ping(server);
			if (ms) {
				usersServers[server.hash] = { ...server, ping: ms };
			}
		}
	}

	res.json({
		success: true,
		servers: usersServers
	});

}

