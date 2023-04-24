import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

interface Reedemable {
	id: number;
	secret: string;
	user: number;
	created_ms: number;
	product: string;
	sessionid: string;
	used: boolean;
}

export const route = "ember/redeem";
export default async function api(req: Request, res: Response): Promise<never | void | unknown> {

	// Check method
	if ([ "GET", "POST" ].indexOf(req.method) === -1) return rejectRequest(res, 405, `Method '${ req.method }' not allowed.`);

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get the transaction secret
	const { secret }: Record<string, string | undefined> = { ...req.body, ...req.query };
	if (!secret) return rejectRequest(res, 400, "Missing key 'secret' in request.");

	// Make sure the secret is valid & maps to the user
	const [ subscription ] = await query<Reedemable>(`SELECT * FROM transactions WHERE used = 0 AND user = "${ user.id }" AND secret = "${ secret }";`);
	if (!subscription) return rejectRequest(res, 400, "Transaction secret is not correct.");

	// Mark the secret as used
	await query(`UPDATE transactions SET used = 1 WHERE id = "${ subscription.id }";`);

	// Get the old subscription & delete it
	const sub = user.getMeta().subscription;
	if (sub) await stripe.subscriptions.del(sub);

	// Get the session
	const session = await stripe.checkout.sessions.retrieve(subscription.sessionid);

	// Set the new subscription
	user.setMeta("subscription", session.subscription as string);

	// If method is get redirect to thankyou page
	if (req.method === "GET") return res.redirect(`https://embervpn.org/subscribe/${ subscription.product.split("_")[1] }/success`);

	// Return success
	return res.json({ success: true });

}
