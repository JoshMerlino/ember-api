import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "stripe/subscription";
export default async function api(req: Request, res: Response) {

	// Check method
	if ([ "GET", "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to do that.");

	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);

	// Get the users subscription
	const subscriptions = await stripe.subscriptions.list({ customer })
		.then(({ data }) => data);
	
	// Get the active subscription
	const active = subscriptions.find(subscription => subscription.cancel_at_period_end === false);

	// Get the inactive subscription
	const inactive = subscriptions.filter(subscription => subscription.id !== active?.id);
	
	// Return the subscription
	res.json({
		success: true,
		active,
		inactive
	});

}
