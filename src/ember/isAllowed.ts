import User from "../auth/User";
import { stripe } from "../stripe";

// Cache the subscriptions
const subscriptionCache = new Map<number, string[]>();

export async function isAllowed(server: Ember.Server, user: User): Promise<false | Ember.Server> {

	// If the user is in the cache
	if (subscriptionCache.has(user.id)) {
	
		// Get the active subscription
		const active = subscriptionCache.get(user.id);
	
		// If the user has an active subscription
		if (active && active.length > 0) return server;

		// No plan no server
		return false;

	}

	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);

	// Get the users subscription
	const subscriptions = await stripe.subscriptions.list({ customer })
		.then(d => d.data);
	
	// Cache the subscriptions
	subscriptionCache.set(user.id, subscriptions
		.filter(subscription => subscription.cancellation_details === null || subscription.status === "active" || subscription.status === "incomplete")
		.map(subscription => subscription.id));
	
	// Clear the cache after 1 minutes
	setTimeout(() => subscriptionCache.delete(user.id), 60000);

	// Now that its in the cache, resolve it from there
	return isAllowed(server, user);
	
}
