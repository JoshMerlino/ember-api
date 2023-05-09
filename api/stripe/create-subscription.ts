import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "stripe/create-subscription";
export default async function api(req: Request, res: Response) {

	// Get body
	const body = { ...req.body, ...req.query };
	const { price: priceId } = body;

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to do that.");

	// Get price from id
	const price = await stripe.prices.retrieve(priceId)
		.catch(() => null);
		
	// Make sure price exists
	if (!price) return rejectRequest(res, 400, "Invalid price id.");
	
	// Make sure that the price is a recurring price
	if (price.type !== "recurring") return rejectRequest(res, 400, "Invalid price id.");

	// Delete the users pending intent
	await query(`DELETE FROM pendingintents WHERE user = ${ user.id }`);
	
	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);

	// Make sure that customer dosnt already have a subscription
	const subscriptions = await stripe.subscriptions.list({ customer }).then(subscriptions => subscriptions.data.filter(subscription => subscription.status !== "canceled"));
	if (subscriptions.length > 0) return rejectRequest(res, 400, "You already have a subscription.");
	
	// Get newest payment method
	const paymentMethods = await stripe.paymentMethods.list({ customer });

	// Create a subscription
	const subscription = await stripe.subscriptions.create({
		customer,
		items: [ { price: price.id } ],
		default_payment_method: paymentMethods.data[0].id,
		off_session: true,
	});

	// Return the subscription
	res.json({
		success: true,
		subscription: subscription.id
	});

}