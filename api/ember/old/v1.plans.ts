import { Request, Response } from "express";
import User from "../../../src/auth/User";
import getAuthorization from "../../../src/auth/getAuthorization";
import { stripe } from "../../../src/stripe";

export const route = "ember/plans";
export default async function api(req: Request, res: Response) {

	// Get all packages
	const { data: packages } = await stripe.products.list({
		limit: 100,
		active: true,
		expand: [ "data.default_price", "data.price" ]
	});

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.json({ success: true, packages });

	// Return the packages
	return res.json({
		success: true,
		packages
	});

}
