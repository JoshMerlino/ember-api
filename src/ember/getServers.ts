import { query } from "../mysql";

export async function getServers(hash?: string): Promise<Ember.Server[]> {

	const serverRow = await query<MySQLData.Server>(hash ? `SELECT * FROM servers WHERE uuid="${ hash }"` : "SELECT * FROM servers;");
	if (!serverRow) throw new Error("No servers found");

	// Loop through servers
	return serverRow.map(server => {
		const [ proto, ip, port, network, subnet ] = server.address
			.split(" ")
			.map(a => a.trim());

		const [ code, country, state ] = server.location.split(";").map(a => a.trim());
		return {
			ip,
			proto,
			hash: server.uuid,
			port: parseInt(port),
			network,
			subnet,
			location: {
				latitude: server.latitude / 1e10,
				longitude: server.longitude / 1e10,
				countryCode: code.split("_")[1],
				country,
				state
			}
		} as Ember.Server;
	});
}
