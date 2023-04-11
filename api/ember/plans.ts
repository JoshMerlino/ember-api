import { Request, Response } from "express";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { stripe } from "../../src/stripe";

export const route = "ember/plans";

export default async function api(req: Request, res: Response): Promise<never | void | unknown> {

	const { data: packages } = await stripe.products.list({
		limit: 100,
		active: true,
		expand: [ "data.default_price", "data.price" ]
	});

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.json({ success: true, packages });

	// Get active subscription
	const { subscription } = user.getMeta();
	const currentSubscription = subscription && await stripe.subscriptions.retrieve(subscription, { expand: [ "plan.product" ]});

	res.json({
		success: true,
		currentSubscription,
		packages
	});
}
