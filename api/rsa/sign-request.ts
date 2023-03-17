import { createHash } from "crypto";
import { Request, Response } from "express";
import * as ssh from "../../src/ssh";

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
	
	// Import request into CA
	await ssh.writeFile(`/tmp/${ hash }.req`, request);
	await ssh.exec(`~/easy-rsa/easyrsa --batch import-req /tmp/${ hash }.req ${ hash }`);
	
	// Sign request
	await ssh.exec(`~/easy-rsa/easyrsa --batch sign-req server ${ hash }`);
	
	// Download certificate
	const cert = await ssh.readFile(`~/easy-rsa/pki/issued/${ hash }.crt`);
	
	// Send certificate
	res.setHeader("Content-Type", "application/x-x509-ca-cert");
	res.setHeader("Content-Disposition", `attachment; filename=${ hash }.key`);
	res.send(cert);

}