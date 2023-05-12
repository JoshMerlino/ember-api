import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { getServers } from "../../src/ember/getServers";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "v2/ember/servers";
export default async function api(req: Request, res: Response): Promise<void | Response> {

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);
	
	// Get servers
	const servers = await getServers(null, user);

	// Check if servers exist
	if (!servers) return rejectRequest(res, 500, "No servers found");

	// Return servers
	return res.json({
		success: true,
		servers: servers
			.reduce((obj, server) => {
				obj[server.hash] = server;
				return obj;
			}, {} as Record<string, Ember.Server>)
		
	} as EmberAPI.Servers);

}
