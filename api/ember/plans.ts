import { Request, Response } from "express";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { stripe } from "../../src/stripe";
import fetchProducts, { Product } from "../../src/stripe/fetchProducts";

let packages: Product[] | undefined;
setInterval(() => packages = undefined, 1000 * 60);

export const route = "ember/plans";

export default async function api(req: Request, res: Response): Promise<never | void | unknown> {

	packages = packages || await fetchProducts();
	
	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.json({ authorized: false, packages });

	// Get active subscription
	const { subscription } = user.meta.value;
	const currentSubscription = subscription && await stripe.subscriptions.retrieve(subscription);

	res.json({
		authorized: true,
		currentSubscription,
		packages,
	});
}