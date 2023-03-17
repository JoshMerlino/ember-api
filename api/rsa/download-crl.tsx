import { Request, Response } from "express";
import { NodeSSH } from "node-ssh";

export const route = "rsa/download-crl";

export default async function api(req: Request, res: Response): Promise<any> {

	// Download the CA certificate
	const ssh = new NodeSSH();
	await ssh.connect({
		host: "ca.embervpn.org",
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8"),
	});

	// Download CA
	const { stdout: crl } = await ssh.execCommand("cat ~/easy-rsa/pki/crl.pem", { cwd: "/root/easy-rsa" });

	// Download the CA certificate
	await ssh.execCommand("~/easy-rsa/easyrsa gen-crl", { cwd: "/root/easy-rsa" });

	// Send the certificate
	res.setHeader("Content-Type", "application/x-pem-file");
	res.setHeader("Content-Disposition", "attachment; filename=crl.pem");

	res.send(crl);

	ssh.dispose();

}