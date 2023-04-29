import { randomBytes } from "crypto";
import { Request, Response } from "express";
import Stripe from "stripe";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "ember/subscribe";
export default async function api(req: Request, res: Response) {

	// Check method
	if (req.method !== "POST") return rejectRequest(res, 405);

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get active subscription
	// const { subscription } = user.getMeta();
	// const currentSubscription = subscription && await stripe.subscriptions.retrieve(subscription);

	// Make sure the user dosnt already this subscription
	// if (currentSubscription && currentSubscription.id === subscription) return rejectRequest(res, 406, "You already have this subscription.");

	// Get the plan id
	const { item, secret: sx }: Record<string, string | undefined> = { ...req.body, ...req.query };
	
	// If item
	if (sx) {
		
		const transactions = await query(`SELECT * FROM transactions WHERE secret = "${ sx }" AND user = "${ user.id }";`);
		if (transactions.length === 0) return rejectRequest(res, 400, "Invalid secret.");
		if (transactions.filter(t => t.used).length > 0) return rejectRequest(res, 400, "Secret already used.");
		
		res.json({
			success: true,
			secret: sx,
		});

	} else if (item) {

		// Dont look if u dont have to
		const pkg = item.startsWith("price_") ? await stripe.prices.retrieve(item, { expand: [ "product", "product.prices" ]})
			.then(r => r.product as Stripe.Product & { default_price: Stripe.Price }) : item.startsWith("prod_") ? await stripe.products.retrieve(item, { expand: [ "default_price" ]}) as Stripe.Product & { default_price: Stripe.Price } : undefined;
		
		// Make sure the plan is valid
		if (!pkg) return rejectRequest(res, 400, "Invalid plan.");
		
		// Create the secret
		const secret = randomBytes(32).toString("hex");
		
		// Create the subscription
		const session = await stripe.checkout.sessions.create({
			payment_method_types: [ "card" ],
			mode: "subscription",
			customer_email: user.email,
			metadata: {
				secret,
				user: user.id
			},
			success_url: `https://embervpn.org/checkout/redeem/${ secret }`,
			cancel_url: `https://embervpn.org/checkout/${ item.split("_")[1] }`,
			line_items: [ {
				quantity: 1,
				price: item.startsWith("price_") ? item : pkg.default_price.id
			} ]
		});
		
		// Insert the transaction
		await query(`INSERT INTO transactions (secret, user, created_ms, product, sessionid) VALUES ("${ secret }", "${ user.id }", ${ Date.now() }, "${ item }", "${ session.id }");`);
		
		// Return the session
		return res.json({
			success: true,
			secret: session.id,
			stripe: process.env.STRIPE_PK
		});
	}
	
	// Make sure the plan is valid
	return rejectRequest(res, 400, "Missing key 'item' or 'secret' in request.");

}
