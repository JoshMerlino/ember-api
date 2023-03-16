import { createHash } from "crypto";
import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import YAML from "yaml";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { Host } from "../../src/ember/host";
import { stripe } from "../../src/stripe";

export const route = "ember/servers";

let servers: Host[];

setInterval(() => void servers, 1000 * 5);

export default async function api(req: Request, res: Response): Promise<void | Response> {
	
	servers = servers || YAML.parse(await readFile(resolve("src/ember/servers.yml"), "utf8"));

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		error: "Unauthorized",
		success: false
	});
	
	// Make sure the user has a subscription
	if (!user.getMeta().subscription) throw new Error("User does not have a subscription");

	// Validate subscription
	const subscription = await stripe.subscriptions.retrieve(user.getMeta().subscription || "");
	if (subscription.status !== "active") throw new Error("User does not have an active subscription");

	res.json({
		success: true,
		servers: servers
			.filter(server => server.granted_to.includes(subscription.items.data[0].plan.product as string) || server.granted_to.includes(user.id))
			.map(server => ({ ...server, hash: createHash("sha256").update(JSON.stringify(server)).digest("hex") }))
	});

}