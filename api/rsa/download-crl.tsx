import { Request, Response } from "express";
import * as ssh from "../../src/ssh";

export const route = "rsa/download-crl";

export default async function api(req: Request, res: Response): Promise<any> {

	// Download the CA certificate
	await ssh.exec("~/easy-rsa/easyrsa gen-crl");
	const crl = await ssh.readFile("~/easy-rsa/pki/crl.pem");

	// Send the certificate
	res.setHeader("Content-Type", "application/x-pem-file");
	res.setHeader("Content-Disposition", "attachment; filename=crl.pem");

	res.send(crl);

}