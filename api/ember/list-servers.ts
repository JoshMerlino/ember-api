import { Request, Response } from "express";
import { getServers } from "../../src/ember/getServers";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "ember/list-servers";
export default async function api(req: Request, res: Response): Promise<void | Response> {
	
	// Get servers
	const servers = await getServers();

	// Check if servers exist
	if (!servers) return rejectRequest(res, 500, "No servers found");

	// Return servers
	return res.json({
		success: true,
		ips: servers.map(server => server.ip)
	});

}
