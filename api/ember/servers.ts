import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { Socket } from "net";
import { resolve } from "path";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { isAllowed } from "../../src/ember/isAllowed";
import rejectRequest from "../../src/util/rejectRequest";

let servers: Record<string, Ember.Server> | undefined = {};
setInterval(() => servers = undefined, 1000 * 5);

// Helper function to ping a server
export const ping = (server: Ember.Server) => new Promise<number | false>(resolve => {
	const start = Date.now();
	const socket = new Socket;
	socket.setTimeout(1000);
	socket.connect(parseInt(server.port), server.ip, () => {
		socket.end();
		resolve(Date.now() - start);
	});
	socket.on("error", () => resolve(false));
	socket.on("timeout", () => resolve(false));
});

export const route = "ember/servers";
export default async function api(req: Request, res: Response): Promise<void | Response> {

	// TODO: Get servers from mysql
	// Get servers
	servers = servers || JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8")) as Record<string, Ember.Server>;

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Filter servers that the user is allowed to see
	const usersServers: Record<string, Ember.Server> = {};
	for (const server of Object.values(servers)) {
		if (await isAllowed(server, user)) usersServers[server.hash] = server;
	}

	// Get ping for each server
	await Promise.all(Object.values(usersServers).map(async server => {
		if (servers && !servers[server.hash].ping) servers[server.hash].ping = await ping(server);
	}));

	// Return servers
	return res.json({
		success: true,
		servers: Object.values(usersServers)
			.filter(server => server.ping !== false)
			.reduce((obj, server) => {
				obj[server.hash] = server;
				return obj;
			}, {} as Record<string, Ember.Server>)
	});

}
