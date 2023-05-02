import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { publicKey, stripe } from "../../src/stripe";
import hash from "../../src/util/hash";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "ember/create-intent";
export default async function api(req: Request, res: Response) {

	// Only allow POST
	if (req.method !== "POST") return rejectRequest(res, 405, `Method ${ req.method } not allowed. Use POST.`);

	// Get params
	const body = { ...req.body, ...req.query, ...req.params };
	const { price: _price } = body;

	// Make sure we have params
	if (!_price) return rejectRequest(res, 400, "Missing key 'price' in request.");

	// fetch stripe price
	const price = await stripe.prices.retrieve(_price, { expand: [ "product" ]})
		.catch(() => null);
	
	// If price is not found
	if (!price) return rejectRequest(res, 400, `Price '${ _price }' not found.`);

	// Fetch user if possible
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401, "You must be an authorized user to create a payment intent.");

	// Create data object
	const data = {
		amount: price.unit_amount || 0,
		currency: price.currency || "usd",
		receipt_email: user?.email || undefined,
		payment_method_types: [ "card" ],
		metadata: { user: user?.id.toString() }
	};

	// Use idempotency key
	const idempotencyKey = hash(JSON.stringify(data));

	// Create payment intent
	const intent = await stripe.paymentIntents.create(data, { idempotencyKey });

	// Send secret
	return res.json({
		success: true,
		intent: intent.id,
		secret: intent.client_secret,
		public: publicKey,
	});

}
