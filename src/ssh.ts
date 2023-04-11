import { createHash } from "crypto";
import fs from "fs/promises";
import { NodeSSH } from "node-ssh";

export const client = new NodeSSH;

client.connect({
	username: "root",
	host: "ca.embervpn.org",
	privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8")
});

export async function exec(cmd: string) {
	const { stdout } = await client.execCommand(cmd, { cwd: "/root/easy-rsa" });
	return stdout;
}

export async function readFile(path: string) {
	return await exec(`cat ${ path }`);
}

export async function writeFile(path: string, content: string) {
	const hash = createHash("sha256").update(path)
		.digest("hex");
	await fs.writeFile(`/tmp/${ hash }`, content, "utf8");
	await client.putFile(`/tmp/${ hash }`, path);
}
