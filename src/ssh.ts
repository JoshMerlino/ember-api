import { NodeSSH } from "node-ssh";
export const client = new NodeSSH();

client.connect({
	host: "216.128.151.20",
	username: "root",
	privateKey: Buffer.from(process.env.CA_IDENTITY || "", "base64").toString("utf8"),
});

export async function exec(cmd: string) {
	const { stdout } = await client.execCommand(cmd);
	return stdout;
}

export async function readFile(path: string) {
	return await exec(`cat ${ path }`);
}