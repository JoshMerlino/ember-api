import { Request, Response } from "express";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { stripe } from "../../src/stripe";
import fetchProducts, { Product } from "../../src/stripe/fetchProducts";

let packages: Product[];

export const route = "ember/plans";

export default async function api(req: Request, res: Response): Promise<never | void | unknown> {

	packages = packages || await fetchProducts();
	
	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.json({ authorized: false, packages });

	// Get active subscription
	const active_subscription = user.meta.value.active_subscription;
	const active = active_subscription && await stripe.subscriptions.retrieve(active_subscription);

	res.json({
		authorized: true,
		packages,
		active_subscription,
		active
	});
}