import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = [ "stripe/invoice", "stripe/invoices" ];
export default async function api(req: Request, res: Response) {

	// Check method
	if ([ "GET" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to do that.");

	// Get all invoices for the user
	const customer = await user.getCustomer();

	// Get the subscription
	const subscription = await stripe.subscriptions.list({ customer: customer.id })
		.then(a => a.data[0].id);

	// If there is no subscription
	if (!subscription) return rejectRequest(res, 400, "You do not have a subscription.");

	// Get all invoices
	const invoices = await stripe.invoices.list({ customer: customer.id, expand: [ "data.charge" ]})
		.then(a => a.data);

	res.json({
		success: true,
		invoices
	});

}