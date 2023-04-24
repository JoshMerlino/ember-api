import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "ember/subscription";
export default async function api(req: Request, res: Response) {

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get the subscription
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };
	const subscription = body.subscription ?? user.getMeta().subscription;
	if (!subscription) return rejectRequest(res, 400, "Missing key 'subscription' in request.");

	// If method is delete
	if (req.method === "DELETE") {

		// Delete the subscription
		await stripe.subscriptions.del(subscription)
			.catch(() => null);

		// Update the user
		user.setMeta("subscription", undefined);

		// Return the response
		return res.json({ success: true });

	}

	// Get the subscription
	const session = await stripe.subscriptions.retrieve(subscription, { expand: [ "plan.product" ]})
		.catch(() => null);
	if (!session) return rejectRequest(res, 400, "Subscription not found.");

	// Return the subscription
	res.json({
		...session,
		success: true
	});

}
