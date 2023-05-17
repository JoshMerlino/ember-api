import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "stripe/invoice";
export default async function api(req: Request, res: Response) {

	// Check method
	if ([ "GET" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to do that.");

	// Get all invoices for the user
	const customer = await user.getCustomer();
	const invoices = await stripe.invoices.list({ customer: customer.id, limit: 100 });

	res.json({
		success: true,
		invoices
	});

}