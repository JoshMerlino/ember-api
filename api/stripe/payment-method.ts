import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "stripe/payment-method";
export default async function api(req: Request, res: Response) {

	// Check method
	if ([ "GET" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to access your payment methods.");

	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);

	// Get the users payment methods
	const methods = await stripe.paymentMethods.list({ customer, type: "card" })
		.then(a => a.data);
	
	res.json({
		success: true,
		methods
	} satisfies REST.APIResponse<EmberAPI.PaymentMethods>);

}
