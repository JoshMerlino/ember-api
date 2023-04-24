import { Request, Response } from "express";
import User from "../../src/auth/User";
import getAuthorization from "../../src/auth/getAuthorization";
import { query } from "../../src/mysql";
import { stripe } from "../../src/stripe";
import rejectRequest from "../../src/util/rejectRequest";

export const route = "ember/redeem";

interface Reedemable {

	id: number;
	secret: string;
	user: number;
	created_ms: number;
	product: string;
	sessionid: string;
	used: boolean;

}

export default async function api(req: Request, res: Response): Promise<never | void | unknown> {

	// See if the user is authorized
	const authorization = getAuthorization(req);
	const user = authorization && await User.fromAuthorization(authorization);
	if (!authorization || !user) return rejectRequest(res, 401);

	// Get the transaction secret
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };
	const secret = body.secret;

	// Make sure the plan is valid
	if (!secret) return rejectRequest(res, 400, "Missing key 'secret' in request.");

	// Make sure the secret is valid & maps to the user
	const [ subscription ] = await query<Reedemable>(`SELECT * FROM transactions WHERE used = 0 AND user = "${ user.id }" AND secret = "${ secret }";`);

	// Make sure the secret is valid
	if (!subscription) return rejectRequest(res, 400, "Transaction secret is not correct.");

	// Mark the secret as used
	await query(`UPDATE transactions SET used = 1 WHERE id = "${ subscription.id }";`);

	// Get the old subscription
	const sub = user.getMeta().subscription;

	// Unsubscribe from the old subscription
	if (sub) await stripe.subscriptions.del(sub);

	// Get the session
	const session = await stripe.checkout.sessions.retrieve(subscription.sessionid);

	user.setMeta("subscription", session.subscription as string);

	// If method is get
	if (req.method === "GET") {

		// Redirect to thankyou page
		return res.redirect(`https://embervpn.org/subscribe/${ subscription.product.split("_")[1] }/success`);

	}

	res.json({ success: true });

}
