import { createHash } from "crypto";
import { Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

export const route = "rsa/server-init";

export default async function api(req: Request, res: Response): Promise<any> {

	const server = req.body;
	const { ip, hostname, iface, proto, port, network, subnet } = server;
	const id = createHash("sha256").update(JSON.stringify(req.body)).digest("hex");

	// Make sure its POST
	if (req.method !== "POST") {
		res.status(405).send("Method Not Allowed");
		return;
	}
	
	// Read servers
	const servers = JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8"));
	servers[id] = server;
	await writeFile(resolve("./userdata/servers.json"), JSON.stringify(servers, null, 4));

	// Read config
	const config = await readFile(resolve("./default/ovpn/server.conf"), "utf8").then(config => config
		.replace(/{{ ip }}/g, ip)
		.replace(/{{ id }}/g, id)
		.replace(/{{ port }}/g, port)
		.replace(/{{ proto }}/g, proto)
		.replace(/{{ iface }}/g, iface)
		.replace(/{{ subnet }}/g, subnet)
		.replace(/{{ network }}/g, network)
		.replace(/{{ hostname }}/g, hostname)
		.split("\n").filter(line => line.length > 0 && !line.startsWith("#") && !line.startsWith(";")).join("\n")
	);

	const hash = createHash("sha256").update(config).digest("hex");

	// Write config
	await writeFile(resolve(`./userdata/.tmp.${ hash }.conf`), config, "utf8");

	res.json({
		success: true,
		ed25519: `${ Buffer.from(process.env.CA_PUB_ED25519 || "", "base64").toString("utf8") } ember_ca`,
		server,
		config: hash
	});

}