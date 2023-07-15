import { createHash } from "crypto";
import { Request, Response } from "express";
import { readFile } from "fs/promises";
import fetch from "node-fetch";
import { resolve } from "path";
import { sql } from "../../src/mysql";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "rsa/download-server-config";
export default async function api(req: Request, res: Response) {

	// Get server info
	const server = req.body;
	const { ipv4, ipv6, hostname, iface, port, network, subnet } = server;

	// Generate hash
	const hash = createHash("sha256").update(JSON.stringify({ ip: ipv4, port }))
		.digest("hex");

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	if (!ipv4) return rejectRequest(res, 400, "Required field 'ipv4' is missing.");
	if (!hostname) return rejectRequest(res, 400, "Required field 'hostname' is missing.");
	if (!iface) return rejectRequest(res, 400, "Required field 'iface' is missing.");
	if (!port) return rejectRequest(res, 400, "Required field 'port' is missing.");
	if (!network) return rejectRequest(res, 400, "Required field 'network' is missing.");
	if (!subnet) return rejectRequest(res, 400, "Required field 'subnet' is missing.");

	// Get server networking info
	const location = await fetch(`https://api.ipgeolocation.io/ipgeo?apiKey=${ process.env.IP_GEO_KEY }&ip=${ ipv4 }`)
		.then(res => res.json())
		.catch(console.error);

	// Check location
	if (!location) return rejectRequest(res, 500, "Failed to get server location.");

	// Get server ip address and serialize location
	const address = [
		network,
		subnet
	].join("/");
	
	const geo = [
		`${ location.continent_code }_${ location.country_code2 }`,
		location.country_name,
		location.district || location.state_prov || location.country_capital
	].join("; ");
	
	// Insert server into database
	const [ serverRow ] = await sql.unsafe("SELECT * FROM servers WHERE uuid = $1", [ hash ]);

	// If server exists
	if (!serverRow) await sql.unsafe("INSERT INTO servers (uuid, latitude, longitude, location, ipv4, port, protocol, internal, ipv6) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [ hash, Math.trunc(location.latitude * 1e10), Math.trunc(location.longitude * 1e10), geo, ipv4, parseInt(port), "ssh,tcp,udp", address, ipv6 ]);
		
	else await sql.unsafe("UPDATE servers SET latitude = $1, longitude = $2, location = $3, ipv4 = $5, port = $6, protocol = $7, internal = $8, ipv6 = $9 WHERE uuid = $4", [ Math.trunc(location.latitude * 1e10), Math.trunc(location.longitude * 1e10), geo, hash, ipv4, parseInt(port), "ssh,tcp,udp", address, ipv6 ]);

	// Read config & inject data
	const config = await readFile(resolve("./default/ovpn/server.conf"), "utf8").then(config => config
		.replace(/{{ ipv4 }}/g, ipv4)
		.replace(/{{ ipv6 }}/g, ipv6)
		.replace(/{{ id }}/g, hash)
		.replace(/{{ port }}/g, port)
		.replace(/{{ iface }}/g, iface)
		.replace(/{{ subnet }}/g, subnet)
		.replace(/{{ network }}/g, network)
		.replace(/{{ hostname }}/g, hostname)
	);

	// Send response
	res.json({
		success: true,
		hash,
		config: Buffer.from(config).toString("base64"),
		ed25519: `${ Buffer.from(process.env.CA_PUB_ED25519 || "", "base64").toString("utf8") } ember_ca`
	});

}
