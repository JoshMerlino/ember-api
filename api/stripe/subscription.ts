import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "stripe/subscription";
export default async function api(req: Request, res: Response) {

	// Check method
	if ([ "GET", "POST", "DELETE" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to do that.");

	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);

	// Get the users subscription
	const subscriptions = await stripe.subscriptions.list({ customer, expand: [ "data.default_payment_method", "data.plan.product" ]})
		.then(({ data }) => data as unknown as Ember.Subscription[]);
	
	// Get the active subscription
	const active = subscriptions.find(subscription => subscription.cancel_at_period_end === false);

	// If the user is deleting their subscription
	if (req.method === "DELETE") {

		// Make sure the user has an active subscription
		if (!active) return rejectRequest(res, 400, "You do not have an active subscription.");

		// Cancel the subscription
		await stripe.subscriptions.update(active.id, { cancel_at_period_end: true });

	}

	// Get the inactive subscription
	const inactive = subscriptions.filter(subscription => subscription.id !== active?.id);
	
	// Return the subscription
	res.json({
		success: true,
		active,
		inactive
	} as REST.APIResponse<EmberAPI.Subscription>);

}
