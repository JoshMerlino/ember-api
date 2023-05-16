import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = [ "stripe/payment-method", "stripe/payment-methods" ];
export default async function api(req: Request, res: Response) {

	// Get body
	const body = { ...req.body, ...req.query };

	// Check method
	if ([ "GET", "DELETE" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to access your payment methods.");

	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);
	
	// If the user is deleting their payment method
	if (req.method === "DELETE") {

		// Get the payment method they want to delete
		const { paymentMethod } = body;
		if (!paymentMethod) return rejectRequest(res, 400, "You must provide a payment method to delete.");

		// Make sure user owns the payment method
		const isAllowed = await stripe.paymentMethods.list({ customer, type: "card" })
			.then(a => a.data)
			.then(methods => methods.map(method => method.id))
			.then(methods => methods.includes(paymentMethod));
		
		// If the user does not own the payment method
		if (!isAllowed) return rejectRequest(res, 403, "You do not own that payment method.");

		// Make sure the payment method is not the default method for any subscriptions
		const subscriptions = await stripe.subscriptions.list({ customer })
			.then(a => a.data.map(a => a.default_payment_method as string));
		
		// If the payment method is the default for any subscriptions
		if (subscriptions.includes(paymentMethod)) return rejectRequest(res, 400, "You cannot delete a payment method that is the default for any subscriptions.");

		// Detach the payment method
		await stripe.paymentMethods.detach(paymentMethod);
		
	}

	// Get the users payment methods
	const methods = await stripe.paymentMethods.list({ customer, type: "card" })
		.then(a => a.data);
	
	// Return the payment methods
	res.json({
		success: true,
		methods
	} satisfies REST.APIResponse<EmberAPI.PaymentMethods>);

}
