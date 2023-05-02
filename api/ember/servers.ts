import { Request, Response } from "express";
import { query } from "../../src/mysql";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "v2/ember/servers";
export default async function api(req: Request, res: Response): Promise<void | Response> {

	const serverRow = await query<MySQLData.Server>("SELECT * FROM servers;");
	if (!serverRow) return rejectRequest(res, 500, "No servers found");

	// Loop through servers
	const servers = serverRow.map(server => {
		const ip = server.address
			.split(" ")
			.map(a => a.trim())[1];
	
		const [ code, country, state ] = server.location.split(";").map(a => a.trim());
		return {
			ip,
			hash: server.uuid,
			location: {
				latitude: server.latitude / 1e10,
				longitude: server.longitude / 1e10,
				countryCode: code.split("_")[1],
				country,
				state
			}
		};
	});

	// Return servers
	return res.json({
		success: true,
		servers: servers.reduce((obj, server) => {
			obj[server.hash] = server;
			return obj;
		}, {} as Record<string, Ember.Server>)
			
	});

}
