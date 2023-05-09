import { Request, Response } from "express";
import User from "../../../src/auth/User";
import getAuthorization from "../../../src/auth/getAuthorization";
import { getServers } from "../../../src/ember/getServers";
import { isAllowed } from "../../../src/ember/isAllowed";
import rejectRequest from "../../../src/util/rejectRequest";

export const route = "ember/servers";
export default async function api(req: Request, res: Response): Promise<void | Response> {

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	const servers = await getServers();
	const usersServers = await Promise.all(servers.filter(async server => await isAllowed(server, user)));

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
