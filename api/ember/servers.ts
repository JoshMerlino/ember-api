import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { resolve } from "path";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { isAllowed } from "../../src/ember/isAllowed";
import { stripe } from "../../src/stripe";

export const route = "ember/servers";

let servers: Record<string, Ember.Server> | undefined = {};

setInterval(() => servers = undefined, 1000 * 5);

export default async function api(req: Request, res: Response): Promise<void | Response> {
	
	servers = servers || JSON.parse(await readFile(resolve("./userdata/servers.json"), "utf8")) as Record<string, Ember.Server>;

	// Ensure authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		error: "Unauthorized",
		success: false
	});
	
	// Make sure the user has a subscription
	if (!user.getMeta().subscription) return res.status(400).json({
		success: false,
		error: "400 Bad Request",
		message: "User does not have a subscription"
	});

	// Validate subscription
	const subscription = await stripe.subscriptions.retrieve(user.getMeta().subscription || "");
	if (subscription.status !== "active") return res.status(400).json({
		success: false,
		error: "400 Bad Request",
		message: "User does not have an active subscription"
	});

	const usersServers: Record<string, Ember.Server> = {};
	for (const server of Object.values(servers)) {
		if (await isAllowed(server, user)) usersServers[server.hash] = server;
	}

	res.json({
		success: true,
		servers: usersServers
	});

}

