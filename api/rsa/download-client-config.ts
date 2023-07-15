import { randomBytes } from "crypto";
import { Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import { NodeSSH } from "node-ssh";
import { resolve } from "path";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { getServers } from "../../src/ember/getServers";
import { isAllowed } from "../../src/ember/isAllowed";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "v2/rsa/download-client-config";
export default async function api(req: Request, res: Response) {

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get the server hash & protocol
	const body: Record<string, string | undefined> = { proto: "tcp", ...req.body, ...req.query };
	const hash = body.hash || body.server;

	// Make sure the user has a valid hash
	if (!hash) return rejectRequest(res, 400, "Missing key 'hash' in request.");

	// Get the server
	const [ server ] = await getServers(hash);
	if (!server) return rejectRequest(res, 404, `Server '${ hash }' not found.`);
	if (!await isAllowed(server, user)) return rejectRequest(res, 403, `You are not allowed to access server '${ hash }'.`);

	// Get supported protocols from the server
	const supportedProtocols = server.proto.split(",").map(proto => proto.trim().toUpperCase());

	// Get the requested protocol
	const reqProto = body.proto?.toUpperCase() as "TCP" | "UDP" | "SSH";

	// Make sure the protocol is supported
	if (!supportedProtocols.includes(reqProto?.toUpperCase() || "")) return rejectRequest(res, 400, `Protocol '${ reqProto }' is not supported by server '${ hash }'.`);
	
	const vpn = new NodeSSH;
	await vpn.connect({
		host: server.ip,
		readyTimeout: 2500,
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8")
	}).catch(() => rejectRequest(res, 500, "Could not connect to VPN server."));
	
	// Initialize connections
	const ssh = new NodeSSH;
	await ssh.connect({
		host: "ca.embervpn.org",
		username: "root",
		readyTimeout: 2500,
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8")
	}).catch(() => rejectRequest(res, 500, "Could not connect to CA server."));

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
	const { ip } = server;
	const clientConfig = await readFile(resolve("./default/ovpn/client.conf"), "utf8");

	// Write clientConfig to tmp && upload
	await writeFile("/tmp/base.conf", clientConfig);
	await vpn.putFile("/tmp/base.conf", "/tmp/base.conf");
	await vpn.execCommand("cp /tmp/base.conf ~/client-configs/", { cwd: "/root" });
	await vpn.execCommand("chown root:root ~/client-configs/keys/*", { cwd: "/root" });

	// Make & download the config
	await vpn.execCommand(`./make_config.sh ${ user.id }`, { cwd: "/root/client-configs" });
	const ovpn = await vpn.execCommand(`cat ~/client-configs/files/${ user.id }.ovpn`, { cwd: "/root" })
		.then(({ stdout }) => stdout
			.replace(/{{ ip }}/g, reqProto === "SSH" ? "127.0.0.1" : ip)
			.replace(/{{ id }}/g, hash)
			.replace(/{{ port }}/g, `${ reqProto === "SSH" ? body.port : server.port }`)
			.replace(/{{ proto }}/g, reqProto === "SSH" ? "tcp4" : reqProto.toLowerCase()));
	
	// If were using localhost
	if (reqProto === "SSH" && body.ed25519) {

		// Make sure this host has a `vpn` user
		if (!await vpn.execCommand("id -u vpn").then(({ stdout }) => stdout.trim()).then(Number).then(Boolean)) return rejectRequest(res, 500, "This server does not support SSH-looping.");

		// Get the authorized keys file from the vpn
		const authorizedKeys = await vpn.execCommand("cat ~/.ssh/authorized_keys", { cwd: "/home/vpn" })
			.then(({ stdout }) => stdout.split("\n"))
			.then(lines => lines.map(function(line) {
				const [ type, key, comment ] = line.split(" ");
				return { type, key, comment };
			}))
			.then(keys => keys.filter(({ comment }) => comment !== `u@${ user.id }` && comment !== "undefined" && comment !== undefined));
		
		// Add the ed25519 key to the authorized keys
		authorizedKeys.push({
			type: "ssh-ed25519",
			key: body.ed25519,
			comment: `u@${ user.id }`
		});
		
		const td = randomBytes(16).toString("hex");
		
		// Write the authorized keys file
		const authorizedKeysFile = authorizedKeys.map(({ type, key, comment }) => `${ type } ${ key } ${ comment }`).join("\n") + "\n";
		await writeFile(`/tmp/authorized_keys-${ td }`, authorizedKeysFile);
		await vpn.putFile(`/tmp/authorized_keys-${ td }`, "/tmp/authorized_keys");
		
		// Move to the vpn's directory and give it the correct permissions
		await vpn.execCommand("mv /tmp/authorized_keys .ssh/authorized_keys", { cwd: "/home/vpn" });
		await vpn.execCommand("chmod 700 .ssh", { cwd: "/home/vpn" });
		await vpn.execCommand("chmod 600 .ssh/authorized_keys", { cwd: "/home/vpn" });
		await vpn.execCommand("chown vpn:vpn .ssh -R", { cwd: "/home/vpn" });

	}

	// Send the config to the user
	res.json({
		success: true,
		config: Buffer.from(ovpn).toString("base64")
	});

	// Clean up
	ssh.dispose();
	vpn.dispose();

}
