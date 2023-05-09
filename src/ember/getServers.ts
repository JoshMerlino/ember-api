import { query } from "../mysql";

export async function getServers() {

	const serverRow = await query<MySQLData.Server>("SELECT * FROM servers;");
	if (!serverRow) throw new Error("No servers found");

	// Loop through servers
	return serverRow.map(server => {
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
}