import User from "../auth/User";
import { stripe } from "../stripe";

export async function isAllowed(server: Ember.Server, user: User): Promise<false | Ember.Server> {

	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);

	// Get the users subscription
	const subscriptions = await stripe.subscriptions.list({ customer })
		.then(({ data }) => data);
	
	// Get the active subscription
	const active = subscriptions
		.filter(subscription => subscription.cancellation_details === null)
		.filter(subscription => subscription.status === "active");

	console.log(active);
	
	// If the user has an active subscription
	if (active.length > 0) return server;

	// No plan no server
	return false;
	
}
