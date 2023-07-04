import User from "../auth/User";
import { sql } from "../mysql";
import { isAllowed } from "./isAllowed";

export async function getServers(hash?: string | null, user?: User): Promise<Ember.Server[]> {

	const serverRow = await sql.unsafe<MySQLData.Server[]>(hash ? "SELECT * FROM servers WHERE uuid = $1" : "SELECT * FROM servers;", hash ? [ hash ] : undefined);
	if (!serverRow) throw new Error("No servers found");

	// Loop through servers
	return await Promise.all(serverRow.map(server => {

		const [ code, country, state ] = server.location.split(";").map(a => a.trim());
		return {
			ip: server.ipv4,
			proto: server.proto,
			hash: server.uuid,
			port: server.port,
			network: server.internal.split("/")[0],
			subnet: server.internal.split("/")[1],
			location: {
				latitude: server.latitude / 1e10,
				longitude: server.longitude / 1e10,
				countryCode: code.split("_")[1],
				country,
				state
			}
		} as Ember.Server;
	}).map(async server => {
		if (!user) return server;
		return await isAllowed(server, user);
	})).then(servers => servers.filter(server => server !== false) as Ember.Server[]);
}
