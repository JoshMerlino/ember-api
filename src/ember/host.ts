import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";
import YAML from "yaml";
import User from "../auth/User";
import { stripe } from "../stripe";

let servers: Host[];
setInterval(() => void servers, 1000 * 5);

export interface Host {
	ip: string;
	port: string;
	proto: "tcp" | "udp";
	name: string;
	granted_to: (string | number)[];
}

export async function lookupHost(host: string, user: User): Promise<Host> {

	servers = servers || YAML.parse(await readFile(resolve("src/ember/servers.yml"), "utf8"));

	// Make sure the user has a subscription
	if (!user.getMeta().subscription) throw new Error("User does not have a subscription");

	// Validate subscription
	const subscription = await stripe.subscriptions.retrieve(user.getMeta().subscription || "");
	if (subscription.status !== "active") throw new Error("User does not have an active subscription");

	// Get the server
	const server = servers.find(server => createHash("sha256").update(JSON.stringify(server))
		.digest("hex") === host);

	// If the server does not exist, throw an error
	if (!server) throw new Error(`Unknown host: ${ host }`);

	// If the user is not granted access to the server, throw an error
	if (!(server.granted_to.includes(subscription.items.data[0].plan.product as string) || server.granted_to.includes(user.id))) throw new Error(`User is not granted access to ${ host }`);

	return server;

}
