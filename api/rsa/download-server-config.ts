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
	const { ip, hostname, iface, proto, port, network, subnet } = server;

	// Generate hash
	const hash = createHash("sha256").update(JSON.stringify({ ip, proto, port }))
		.digest("hex");

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	if (!ip) return rejectRequest(res, 400, "Required field 'ip' is missing.");
	if (!hostname) return rejectRequest(res, 400, "Required field 'hostname' is missing.");
	if (!iface) return rejectRequest(res, 400, "Required field 'iface' is missing.");
	if (!proto) return rejectRequest(res, 400, "Required field 'proto' is missing.");
	if (!port) return rejectRequest(res, 400, "Required field 'port' is missing.");
	if (!network) return rejectRequest(res, 400, "Required field 'network' is missing.");
	if (!subnet) return rejectRequest(res, 400, "Required field 'subnet' is missing.");

	// Get server networking info
	const location = await fetch(`https://api.ipgeolocation.io/ipgeo?apiKey=${ process.env.IP_GEO_KEY }&ip=${ ip }`)
		.then(res => res.json())
		.catch(console.error);

	// Check location
	if (!location) return rejectRequest(res, 500, "Failed to get server location.");

	// Get server ip address and serialize location
	const address = [
		proto,
		ip,
		port,
		network,
		subnet
	].join(" ");
	const geo = [
		`${ location.continent_code }_${ location.country_code2 }`,
		location.country_name,
		location.district || location.state_prov || location.country_capital
	].join("; ");
	
	// Insert server into database
	const [ serverRow ] = await sql.unsafe<Array<any>>("SELECT * FROM servers WHERE uuid = $1", [ hash ]);

	// If server exists
	if (!serverRow) await sql.unsafe("INSERT INTO servers (uuid, address, latitude, longitude, location) VALUES ($1, $2, $3, $4, $5)", [ hash, address, Math.trunc(location.latitude * 1e10), Math.trunc(location.longitude * 1e10), geo ]);
	else await sql.unsafe("UPDATE servers SET address = $1, latitude = $2, longitude = $3, location = $4 WHERE uuid = $5", [ address, Math.trunc(location.latitude * 1e10), Math.trunc(location.longitude * 1e10), geo, hash ]);

	// Read config & inject data
	const config = await readFile(resolve("./default/ovpn/server.conf"), "utf8").then(config => config
		.replace(/{{ ip }}/g, ip)
		.replace(/{{ id }}/g, hash)
		.replace(/{{ port }}/g, port)
		.replace(/{{ proto }}/g, proto)
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
