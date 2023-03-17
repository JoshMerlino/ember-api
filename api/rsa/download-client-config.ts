import { createHash } from "crypto";
import { Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import { NodeSSH } from "node-ssh";
import { resolve } from "path";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import * as ssh from "../../src/ssh";

export const route = "rsa/download-client-config";

export default async function api(req: Request, res: Response): Promise<any> {

	const accessMap: Record<string, string[]> = JSON.parse(await readFile(resolve("./userdata/accessMap.json"), "utf8"));

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});
	
	const hash = req.query.server ?? req.body.server;

	// get server from servers
	const servers: Ember.Server[] = JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8"));
	const server = servers[hash];

	if (!servers.hasOwnProperty(hash)) return res.status(404).json({
		success: false,
		error: "404 Not Found",
		message: `Server '${ hash }' not found`
	});

	if (!accessMap[user.id].includes(hash)) return res.status(403).json({
		success: false,
		error: "403 Forbidden",
		message: `You are not allowed to access server '${ hash }'`
	});

	// TODO: generate and download client config
	const vpn = new NodeSSH();
	await vpn.connect({
		host: server.ip,
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8"),
	});

	// Generate the request & key
	await vpn.execCommand(`./easyrsa --batch gen-req ${ user.id } nopass`, { cwd: "/root/easy-rsa" });
	await vpn.execCommand(`cp ~/easy-rsa/pki/private/${ user.id }.key ~/client-configs/keys/`, { cwd: "/root/easy-rsa" });
	
	// Download the request
	const { stdout: request } = await vpn.execCommand(`cat ~/easy-rsa/pki/reqs/${ user.id }.req`, { cwd: "/root/easy-rsa" });
	const { stdout: key } = await vpn.execCommand(`cat ~/easy-rsa/pki/private/${ user.id }.key`, { cwd: "/root/easy-rsa" });
	const { stdout: ta } = await vpn.execCommand("cat ~/client-configs/keys/ta.key", { cwd: "/root/easy-rsa" });
	await vpn.execCommand(`cp ~/easy-rsa/pki/private/${ user.id }.key ~/client-configs/keys/`, { cwd: "/root/easy-rsa" });

	// Send to the CA server
	await ssh.writeFile(`/tmp/${ user.id }.req`, request);
	
	// Sign the request
	await ssh.exec(`~/easy-rsa/easyrsa --batch import-req /tmp/${ user.id }.req ${ user.id }`);
	await ssh.exec(`~/easy-rsa/easyrsa --batch sign-req client ${ user.id }`);
	
	// Download the certificate to the vpn
	const certificate = await ssh.readFile(`~/easy-rsa/pki/issued/${ user.id }.crt`);
	const ca = await ssh.readFile("~/easy-rsa/pki/ca.crt");

	const chash = createHash("sha256").update(certificate).digest("hex");
	await writeFile(`/tmp/${ chash }`, certificate, "utf8");
	await vpn.putFile(`/tmp/${ chash }`, `~/client-configs/keys/${ user.id }.crt`);

	// Read config
	const config = await readFile(resolve("./default/ovpn/client.conf"), "utf8").then(config => config
		.replace(/{{ ip }}/g, server.ip)
		.replace(/{{ id }}/g, hash)
		.replace(/{{ port }}/g, server.port)
		.replace(/{{ proto }}/g, server.proto)
		.replace(/{{ iface }}/g, server.iface)
		.replace(/{{ subnet }}/g, server.subnet)
		.replace(/{{ network }}/g, server.network)
		.replace(/{{ hostname }}/g, server.hostname)
		.split("\n").filter(line => line.length > 0 && !line.startsWith("#") && !line.startsWith(";")).join("\n"));

	vpn.dispose();

	res.json({
		success: true,
		server,
		user: user.toSafe(),
		config: Buffer.from([ certificate,	ca,	ta,	key, config ].join("\n")).toString("base64")
	});
	
}