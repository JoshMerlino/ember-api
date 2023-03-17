import { createHash } from "crypto";
import { Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import { NodeSSH } from "node-ssh";
import { resolve } from "path";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";

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

	// Download the CA certificate
	const ssh = new NodeSSH();
	await ssh.connect({
		host: "ca.embervpn.org",
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8"),
	});

	const vpn = new NodeSSH();
	await vpn.connect({
		host: server.ip,
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8"),
	});

	// Generate the request & key
	await vpn.execCommand(`EASYRSA_REQ_CN=u@${ user.id } ./easyrsa --batch gen-req ${ user.id } nopass`, { cwd: "/root/easy-rsa" });
	await vpn.execCommand(`cp /root/easy-rsa/pki/private/${ user.id }.key /root/client-configs/keys/`, { cwd: "/root" });
	
	// Download the request
	const { stdout: request } = await vpn.execCommand(`cat /root/easy-rsa/pki/reqs/${ user.id }.req`, { cwd: "/root/easy-rsa" });
	await vpn.execCommand(`cp /root/easy-rsa/pki/private/${ user.id }.key /root/client-configs/keys/`, { cwd: "/root" });

	// Send request to CA
	await writeFile(`/tmp/${ user.id }.req`, request, "utf8");
	await ssh.putFile(`/tmp/${ user.id }.req`, `/tmp/${ user.id }.req`);
	
	// Purge old certificates requests
	await ssh.execCommand(`rm /root/easy-rsa/pki/reqs/${ user.id }.req`, { cwd: "/root/easy-rsa" });

	// Sign the request
	await ssh.execCommand(`/root/easy-rsa/easyrsa --batch import-req /tmp/${ user.id }.req ${ user.id }`, { cwd: "/root/easy-rsa" });
	await ssh.execCommand(`/root/easy-rsa/easyrsa --batch sign-req client ${ user.id }`, { cwd: "/root/easy-rsa" });
	
	// Download the certificate to the vpn
	const { stdout: certificate } = await ssh.execCommand(`cat /root/easy-rsa/pki/issued/${ user.id }.crt`, { cwd: "/root/easy-rsa" });

	// Send certificate to vpn
	await writeFile(`/tmp/${ user.id }.crt`, certificate, "utf8");
	await vpn.putFile(`/tmp/${ user.id }.crt`, `/root/client-configs/keys/${ user.id }.crt`);

	// Send CA to vpn
	const { stdout: ca } = await ssh.execCommand("cat /root/easy-rsa/pki/ca.crt", { cwd: "/root/easy-rsa" });
	await writeFile("/tmp/ca.crt", ca, "utf8");
	await vpn.putFile("/tmp/ca.crt", "/root/client-configs/keys/ca.crt");

	const chash = createHash("sha256").update(certificate).digest("hex");
	await writeFile(`/tmp/${ chash }`, certificate, "utf8");
	await vpn.putFile(`/tmp/${ chash }`, `/root/client-configs/keys/${ user.id }.crt`);

	// Read config
	const config = await readFile(resolve("./default/ovpn/client.conf"), "utf8").then(config => config
		.replace(/{{ ip }}/g, server.ip)
		.replace(/{{ id }}/g, hash)
		.replace(/{{ port }}/g, server.port)
		.replace(/{{ proto }}/g, server.proto)
		.replace(/{{ iface }}/g, server.iface)
		.replace(/{{ subnet }}/g, server.subnet)
		.replace(/{{ network }}/g, server.network)
		.replace(/{{ hostname }}/g, server.hostname));

	// .split("\n").filter(line => line.length > 0 && !line.startsWith("#") && !line.startsWith(";")).join("\n"));

	// Write base config to /root/client-configs/base.conf on the vpn
	await writeFile("/tmp/base.conf", config, "utf8");
	await vpn.putFile("/tmp/base.conf", "/root/client-configs/base.conf");

	// Build config
	await vpn.execCommand(`./make_config.sh ${ user.id }`, { cwd: "/root/client-configs" });
	
	// Download config
	const { stdout } = await vpn.execCommand(`cat /root/client-configs/files/${ user.id }.ovpn`, { cwd: "/root/client-configs" });

	vpn.dispose();
	ssh.dispose();

	res.json({
		success: true,
		server,
		user: user.toSafe(),
		config: Buffer.from(stdout).toString("base64")
	});
	
}