import { readFile } from "fs/promises";
import { resolve } from "path";
import YAML from "yaml";
import User from "../auth/User";
import { stripe } from "../stripe";

let servers: Record<string, string[]>;
setInterval(() => void servers, 1000 * 5);

export interface Host {
	ip: string;
	port: string;
	proto: "tcp" | "udp";
}

export async function lookupHost(host: string, user: User): Promise<Host> {

	servers = servers || YAML.parse(await readFile(resolve("src/ember/servers.yml"), "utf8"));

	// Make sure the user has a subscription
	if (!user.meta.value.subscription) throw new Error("User does not have a subscription");

	// Validate subscription
	const subscription = await stripe.subscriptions.retrieve(user.meta.value.subscription);
	if (subscription.status !== "active") throw new Error("User does not have an active subscription");

	// Make sure subscription has access to host
	if (!(servers[subscription.id] && servers[subscription.id].includes(host))) throw new Error(`Plan ${ subscription.id } does not have access to ${ host }`);
		
	// Return ip addresses
	switch (host) {
	default: throw new Error(`Unknown host: ${ host }`);
	case "test":
	case "default":
		return {
			ip: "10.16.169.10",
			port: "3194",
			proto: "tcp"
		};
	}

}