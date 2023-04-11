import { Request, Response } from "express";
import { NodeSSH } from "node-ssh";
export const route = "rsa/download-ca";

export default async function api(req: Request, res: Response): Promise<any> {

	// Download the CA certificate
	const ssh = new NodeSSH;
	await ssh.connect({
		host: "ca.embervpn.org",
		username: "root",
		privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8")
	});

	// Download CA
	const { stdout: ca } = await ssh.execCommand("cat ~/easy-rsa/pki/ca.crt", { cwd: "/root/easy-rsa" });

	// Send the CA certificate
	res.setHeader("Content-Type", "application/x-x509-ca-cert");
	res.setHeader("Content-Disposition", "attachment; filename=ca.crt");
	res.send(ca);

	ssh.dispose();

}
