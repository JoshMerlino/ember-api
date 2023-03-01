import { createHash } from "crypto";
import { Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import mkdirp from "mkdirp";
import { NodeSSH } from "node-ssh";
import { resolve } from "path";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { lookupHost } from "../../src/ember/host";
const ssh = new NodeSSH();

export const route = "ember/create-connection";

export default async function api(req: Request, res: Response): Promise<void | Response> {

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		error: "Unauthorized",
		success: false
	});

	// Get host from request params
	const hostname = typeof req.query.host === "string" ? req.query.host : false;

	// If host is not a string, return 400
	if (!hostname) return res.status(400).json({
		error: "Missing host",
		success: false
	});

	// Attempt to connect to host
	try {

		// Get the host
		const host = await lookupHost(hostname, user);
	
		// Get the private key
		const privateKey = await readFile(resolve(process.env.HOME || "~", ".ssh/id_ed25519"), "utf8");

		// Connect to host
		const connection = await ssh.connect({
			host: host.ip,
			privateKey,
			username: "vpn",
		});
		
		// Generate key
		const { stdout } = await connection.execCommand([
			"/vpn/.bin/create-connection",
			user.id.toString(36)
		].join(" "));

		// Get the config path from command output
		const config_path = stdout.split(/\n/).reverse()[0];
	
		// Get read that file
		const config = await connection.execCommand(`cat ${ config_path }`)
			.then(({ stdout }) => stdout
				.replace(/%PROTO%/g, host.proto)
				.replace(/%PORT%/g, host.port)
				.replace(/%IPADDR%/g, host.ip));
		
		// Hash the config
		const hash = createHash("sha512")
			.update(config)
			.digest("hex");
		
		// Write config to file
		await mkdirp(resolve("userdata/configs"));
		await writeFile(resolve("userdata/configs", `${ hash }.ovpn`), config, "utf8");
		
		res.json({
			success: true,
			hash
		});

	} catch (error) {
		res.status(500).json({
			error: (<Error>error).toString(),
			success: false
		});
	}

}