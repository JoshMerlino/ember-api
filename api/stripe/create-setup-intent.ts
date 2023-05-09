import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import { publicKey, stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "stripe/create-setup-intent";
export default async function api(req: Request, res: Response) {

	// Check method
	if ([ "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);
	
	// Make sure user is authenticated
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!user) return rejectRequest(res, 401, "You must be logged in to do that.");

	// Search for existing setup intent
	const [ si ] = await query<MySQLData.PendingIntents>(`SELECT * FROM pendingintents WHERE user=${ user.id }`);
	if (si) return res.json({
		success: true,
		intent: si.intent,
		secret: si.secret,
		public: publicKey
	} as EmberAPI.SecretIntent);
	
	const customer = await user.getCustomer();
	
	// Create new setup intent
	const intent = await stripe.setupIntents.create({
		customer: customer.id,
		metadata: {
			user: user.id
		}
	});
	
	// Save intent
	await query(`DELETE FROM pendingintents WHERE user=${ user.id }`);
	await query(`INSERT INTO pendingintents (user, intent, secret) VALUES (${ user.id }, '${ intent.id }', '${ intent.client_secret }')`);
	
	// Return intent
	res.json({
		success: true,
		intent: intent.id,
		secret: intent.client_secret,
		public: publicKey
	} as EmberAPI.SecretIntent);

}