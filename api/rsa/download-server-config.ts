import { createHash } from "crypto";
import { Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import fetch from "node-fetch";
import { resolve } from "path";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "rsa/download-server-config";
export default async function api(req: Request, res: Response) {

	// Get server info
	const server = req.body;
	const { ip, hostname, iface, proto, port, network, subnet } = server;

	// Generate hash
	const hash = createHash("sha256").update(JSON.stringify(server))
		.digest("hex");

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

	// Get server networking info
	const location = await fetch(`https://api.ipgeolocation.io/ipgeo?apiKey=${ process.env.IP_GEO_KEY }&ip=${ ip }`)
		.then(res => res.json())
		.catch(console.error);

	// Check location
	if (!location) return rejectRequest(res, 500, "Failed to get server location.");

	// TODO: Use MySQL to store server info
	// Read servers
	const servers = JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8"));
	servers[hash] = { ...server, hash, location };
	await writeFile(resolve("./userdata/servers.json"), JSON.stringify(servers, null, 4));

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
