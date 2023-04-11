import { Request, Response } from "express";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { query } from "../../src/mysql";
import { stripe } from "../../src/stripe";

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
	if (!authorization || !user) return res.status(401).json({
		success: false,
		error: "401 Unauthorized",
		description: "You likley do not have a valid session token."
	});

	// Get the transaction secret
	const body: Record<string, string | undefined> = { ...req.body, ...req.query };
	const secret = body.secret;

	// Make sure the plan is valid
	if (!secret) return res.status(400).json({
		success: false,
		error: "400 Bad Request",
		description: "You must provide a transaction secret."
	});

	// Make sure the secret is valid & maps to the user
	const [ subscription ] = await query<Reedemable>(`SELECT * FROM transactions WHERE used = 0 AND user = "${ user.id }" AND secret = "${ secret }";`);

	// Make sure the secret is valid
	if (!subscription) return res.status(400).json({
		success: false,
		error: "400 Bad Request",
		description: "The transaction secret is invalid."
	});

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
