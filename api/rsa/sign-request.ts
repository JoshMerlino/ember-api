import { createHash } from "crypto";
import { Request, Response } from "express";
import { writeFile } from "fs/promises";
import { NodeSSH } from "node-ssh";

export const route = "rsa/sign-request";

export default async function api(req: Request, res: Response): Promise<any> {

	// Make sure its POST
	if (req.method !== "POST") {
		res.status(405).send("Method Not Allowed");
		return;
	}

	// Get the certificate request
	const request = Buffer.from(req.body.req, "base64").toString("utf8");
	
	// Get the hash
	const hash = createHash("sha256").update(request).digest("hex");

	// Download the CA certificate
	const ssh = new NodeSSH();
	await ssh.connect({
		host: "ca.embervpn.org",
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8"),
	});
	
	// Import request into CA
	// await ssh.writeFile(`/tmp/${hash}.req`, request);

	// Send request to CA
	await writeFile(`/tmp/${ hash }.req`, request, "utf8");
	await ssh.putFile(`/tmp/${ hash }.req`, `/tmp/${ hash }.req`);

	await ssh.execCommand(`~/easy-rsa/easyrsa --batch import-req /tmp/${ hash }.req ${ hash }`, { cwd: "/root/easy-rsa" });
	
	// Sign request
	await ssh.execCommand(`~/easy-rsa/easyrsa --batch sign-req server ${ hash }`, { cwd: "/root/easy-rsa" });
	
	// Download certificate
	const { stdout: cert } = await ssh.execCommand(`cat ~/easy-rsa/pki/issued/${ hash }.crt`, { cwd: "/root/easy-rsa" });
	
	// Send certificate
	res.setHeader("Content-Type", "application/x-x509-ca-cert");
	res.setHeader("Content-Disposition", `attachment; filename=${ hash }.key`);
	res.send(cert);

	ssh.dispose();

}