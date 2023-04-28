import { Request, Response } from "express";
import User from "../../src/auth/User";
import { stripe } from "../../src/stripe";
import hash from "../../src/util/hash";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "ember/create-intent";
export default async function api(req: Request, res: Response) {

	// Get params
	const body = { ...req.body, ...req.query, ...req.params };
	const { price: _price, user: _user } = body;

	// Make sure we have params
	if (!_price) return rejectRequest(res, 400, "Missing key 'price' in request.");

	// fetch stripe price
	const price = await stripe.prices.retrieve(_price)
		.catch(() => null);
	
	// If price is not found
	if (!price) return rejectRequest(res, 400, `Price '${ _price }' not found.`);

	// Fetch user if possible
	const user = _user && await User.fromID(parseInt(_user.toString()));

	// Generate idempotent key
	const idempotencyKey = user ? hash(`${ price.id }-${ user?.id || "guest" }`) : undefined;

	// Create payment intent
	const intent = await stripe.paymentIntents.create({
		amount: price.unit_amount || 0,
		currency: price.currency || "usd",
		receipt_email: user?.email || undefined,
		payment_method_types: [ "card", "cashapp", "venmo" ],
	}, { idempotencyKey	});

	// Send secret
	return res.json({
		success: true,
		secret: intent.client_secret
	});

}
