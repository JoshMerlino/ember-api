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
 
	if (!(accessMap[user.id] || []).includes(hash)) return res.status(403).json({
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
	
	// Generate the request
	await vpn.execCommand("mkdir -fp ~/client-configs/keys");
	await vpn.execCommand("chmod -R 700 ~/client-configs");
	await vpn.execCommand(`./easyrsa --batch --req-cn="u@${ user.id }" gen-req ${ user.id } nopass`, { cwd: "/root/easy-rsa" });
	await vpn.execCommand(`cp ~/easy-rsa/pki/private/${ user.id }.key ~/client-configs/keys/`, { cwd: "/root" });
	
	// Download the request
	const { stdout: request } = await vpn.execCommand(`cat ~/easy-rsa/pki/reqs/${ user.id }.req`, { cwd: "/root/easy-rsa" });
	await writeFile(`/tmp/${ user.id }.req`, request);
	
	// Upload to the CA server
	await ssh.putFile(`/tmp/${ user.id }.req`, `/tmp/${ user.id }.req`);
	await ssh.execCommand(`rm ./pki/reqs/${ user.id }.req`, { cwd: "/root/easy-rsa" });
	await ssh.execCommand(`./easyrsa --batch import-req /tmp/${ user.id }.req ${ user.id }`, { cwd: "/root/easy-rsa" });
	
	// Sign the request
	await ssh.execCommand(`./easyrsa --batch sign-req client ${ user.id }`, { cwd: "/root/easy-rsa" });
	
	// Download the certificate	
	const { stdout: cert } = await ssh.execCommand(`cat ./pki/issued/${ user.id }.crt`, { cwd: "/root/easy-rsa" });
	await writeFile(`/tmp/${ user.id }.crt`, cert);
	
	// Upload to the VPN server
	await vpn.putFile(`/tmp/${ user.id }.crt`, `/tmp/${ user.id }.crt`);
	await vpn.execCommand(`cp /tmp/${ user.id }.crt ~/client-configs/keys/`, { cwd: "/root" });
	
	// Copy the latest TA and CA certificates
	await vpn.execCommand("cp /etc/openvpn/server/{ta.key,ca.crt} ~/client-configs/keys/", { cwd: "/root" });
	
	// Chown
	await vpn.execCommand("sudo chown root:root ~/client-configs/keys/*", { cwd: "/root" });

	// Make the config
	await vpn.execCommand(`./make_config.sh ${ user.id }`, { cwd: "/root/client-configs" });
	
	// Download the config
	const { stdout: ovpn } = await vpn.execCommand(`cat ~/client-configs/files/${ user.id }.ovpn`, { cwd: "/root" });
	await writeFile(`/tmp/${ user.id }.ovpn`, ovpn);
	
	const config = await readFile(`/tmp/${ user.id }.ovpn`, "base64");

	res.json({
		success: true,
		server,
		user: user.toSafe(),
		config
	});
	
}