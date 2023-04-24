import { createHash } from "crypto";
import { Request, Response } from "express";
import { writeFile } from "fs/promises";
import { NodeSSH } from "node-ssh";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "rsa/sign-request";
export default async function api(req: Request, res: Response) {

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

	// Get the certificate request
	const request = Buffer.from(req.body.req, "base64").toString("utf8");

	// Get the hash
	const hash = createHash("sha256").update(request)
		.digest("hex");

	// Download the CA certificate
	const ssh = new NodeSSH;
	await ssh.connect({
		host: "ca.embervpn.org",
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8")
	});

	// Send request to CA
	await writeFile(`/tmp/${ hash }.req`, request, "utf8");
	await ssh.putFile(`/tmp/${ hash }.req`, `/tmp/${ hash }.req`);

	// Import & sign request
	await ssh.execCommand(`~/easy-rsa/easyrsa --batch import-req /tmp/${ hash }.req ${ hash }`, { cwd: "/root/easy-rsa" });
	await ssh.execCommand(`~/easy-rsa/easyrsa --batch sign-req server ${ hash }`, { cwd: "/root/easy-rsa" });

	// Download certificate
	const { stdout: cert } = await ssh.execCommand(`cat ~/easy-rsa/pki/issued/${ hash }.crt`, { cwd: "/root/easy-rsa" });

	// Send certificate
	res.setHeader("Content-Type", "application/x-x509-ca-cert");
	res.setHeader("Content-Disposition", `attachment; filename=${ hash }.key`);
	res.send(cert);

	// Cleanup
	ssh.dispose();

}
