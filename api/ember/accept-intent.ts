import { Request, Response } from "express";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";

export const route = [ "ember/accept-intent", "ember/redeem" ];
export default async function api(req: Request, res: Response) {

	// Parse QS
	const { payment_intent, payment_intent_client_secret } = req.query as Record<string, string>;

	// Check params
	if (!payment_intent) return rejectRequest(res, 400, "Missing key 'payment_intent' in request.");
	if (!payment_intent_client_secret) return rejectRequest(res, 400, "Missing key 'payment_intent_client_secret' in request.");

	// Get user from authorization
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get stripe payment intent
	const intent = await stripe.paymentIntents.retrieve(payment_intent);

	// Determine if intent is paid
	if (intent.status !== "succeeded") return rejectRequest(res, 402, "Payment not yet completed.");

	// Get the product from the intent
	const product = await stripe.products.retrieve(intent.metadata.product)
		.catch(() => null);
	
	// If product is not found
	if (!product) return rejectRequest(res, 400, `Product '${ intent.metadata.product }' not found.`);
	
	res.json({
		success: true,
		intent,
		product
	});

}