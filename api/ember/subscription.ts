import { Request, Response } from "express";
import getAuthorization from "../../src/auth/getAuthorization";
import User from "../../src/auth/User";
import { stripe } from "../../src/stripe";

export const route = "ember/subscription";

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
	const subscription = body.subscription;

	// Make sure the plan is valid
	if (!subscription) return res.status(400).json({
		success: false,
		error: "400 Bad Request",
		description: "You must provide a subscription."
	});

	// If method is delete
	if (req.method === "DELETE") {

		// Delete the subscription
		try {

			await stripe.subscriptions.del(subscription);

			// Update the user
			user.getMeta().value = { ...user.meta, subscription: undefined };

			// Return the response
			return res.json({ success: true });

		} catch (error) {

			// Return the response
			return res.status(500).json({
				success: false,
				error: "500 Internal Server Error"
			});

		}

	}

	res.json({
		...await stripe.subscriptions.retrieve(subscription, { expand: [ "plan.product" ]}),
		success: true
	});

}