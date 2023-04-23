import { randomBytes } from "crypto";
import { Request, Response } from "express";
import Stripe from "stripe";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import { stripe } from "../../src/stripe";

export const route = "ember/subscribe";

export default async function api(req: Request, res: Response): Promise<never | void | unknown> {

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return res.status(401).json({
		success: false,
		message: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// Get active subscription
	const { subscription } = user.getMeta();
	const currentSubscription = subscription && await stripe.subscriptions.retrieve(subscription);

	// Make sure the user dosnt already this subscription
	if (currentSubscription && currentSubscription.id === subscription) return res.status(400).json({
		success: false,
		message: "400 Bad Request",
		description: "You already have a subscription."
	});

	// Get the plan id
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };
	const { item, host } = body;

	// Make sure the plan is valid
	if (!item) return res.status(400).json({
		success: false,
		message: "400 Bad Request",
		description: "You must provide a plan id."
	});

	// Get the plan
	// Const pkg = item.startsWith("prod_") ? await stripe.products.retrieve(item) : await stripe.prices.retrieve(item, { expand: "data.product" }).then(r => r.product);

	// Dont look if u dont have to
	const pkg = item.startsWith("price_") ? await stripe.prices.retrieve(item, { expand: [ "product" ]})
		.then(r => r.product as Stripe.Product & { default_price: Stripe.Price }): item.startsWith("prod_") ? await stripe.products.retrieve(item, { expand: [ "default_price" ]}) as Stripe.Product & { default_price: Stripe.Price }: undefined;

	// Make sure the plan is valid
	if (!pkg) return res.status(400).json({
		success: false,
		message: "400 Bad Request",
		description: "The plan id you provided is invalid."
	});

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
		success_url: `https://api.embervpn.org/ember/redeem?secret=${ secret }&authorization=${ authorization }`,
		cancel_url: "https://embervpn.org",
		line_items: [ {
			quantity: 1,
			price: item.startsWith("price_") ? item : pkg.default_price.id
		} ]
	});

	await query(`INSERT INTO transactions (secret, user, created_ms, product, sessionid) VALUES ("${ secret }", "${ user.id }", ${ Date.now() }, "${ pkg.id }", "${ session.id }");`);

	res.json({
		success: true,
		sessionId: session.id,
		item
	});

}
