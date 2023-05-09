import { Request, Response } from "express";
import { getServers } from "../../src/ember/getServers";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "v2/ember/servers";
export default async function api(req: Request, res: Response): Promise<void | Response> {

	const servers = await getServers();

	// Check if servers exist
	if (!servers) return rejectRequest(res, 500, "No servers found");

	// Return servers
	return res.json({
		success: true,
		servers: servers.reduce((obj, server) => {
			obj[server.hash] = server;
			return obj;
		}, {} as Record<string, Ember.Server>)
			
	});

}
