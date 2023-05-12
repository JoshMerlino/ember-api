import { Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import { NodeSSH } from "node-ssh";
import { resolve } from "path";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { getServers } from "../../src/ember/getServers";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "v2/rsa/download-client-config";
export default async function api(req: Request, res: Response) {

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get the server hash
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };
	const hash = body.hash || body.server;
	if (!hash) return rejectRequest(res, 400, "Missing key 'hash' in request.");

	// Get the server
	const [ server ] = await getServers(hash, user);
	if (!server) return rejectRequest(res, 403, `You are not allowed to access server with ID '${ hash }'.`);
	
	// Initialize connections
	const ssh = new NodeSSH;
	await ssh.connect({
		host: "ca.embervpn.org",
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8")
	});

	const vpn = new NodeSSH;
	await vpn.connect({
		host: server.ip,
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8")
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

	// Send the updated client config base to the VPN server
	const { ip, proto, port } = server;
	const clientConfig = await readFile(resolve("./default/ovpn/client.conf"), "utf8").then(config => config
		.replace(/{{ ip }}/g, ip)
		.replace(/{{ id }}/g, hash)
		.replace(/{{ port }}/g, `${ port }`)
		.replace(/{{ proto }}/g, proto)
	);

	// Write clientConfig to tmp && upload
	await writeFile("/tmp/base.conf", clientConfig);
	await vpn.putFile("/tmp/base.conf", "/tmp/base.conf");
	await vpn.execCommand("cp /tmp/base.conf ~/client-configs/", { cwd: "/root" });
	await vpn.execCommand("chown root:root ~/client-configs/keys/*", { cwd: "/root" });

	// Make & download the config
	await vpn.execCommand(`./make_config.sh ${ user.id }`, { cwd: "/root/client-configs" });
	const { stdout: ovpn } = await vpn.execCommand(`cat ~/client-configs/files/${ user.id }.ovpn`, { cwd: "/root" });

	// Send the config to the user
	res.json({
		success: true,
		config: Buffer.from(ovpn).toString("base64")
	});

}
