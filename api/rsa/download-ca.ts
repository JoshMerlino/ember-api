import { Request, Response } from "express";
import * as ssh from "../../src/ssh";

export const route = "rsa/download-ca";

export default async function api(req: Request, res: Response): Promise<any> {

	// Download the CA certificate
	const ca = await ssh.readFile("~/easy-rsa/pki/ca.crt");

	// Send the CA certificate
	res.setHeader("Content-Type", "application/x-x509-ca-cert");
	res.setHeader("Content-Disposition", "attachment; filename=ca.crt");
	res.send(ca);

}