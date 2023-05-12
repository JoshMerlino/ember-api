import User from "../auth/User";
import { stripe } from "../stripe";

export async function isAllowed(server: Ember.Server, user: User): Promise<false | Ember.Server> {

	// Get the users customer id
	const customer = await user.getCustomer().then(customer => customer.id);

	// Get the users subscription
	const subscriptions = await stripe.subscriptions.list({ customer, expand: [ "data.default_payment_method", "data.plan.product" ]})
		.then(({ data }) => data as unknown as Ember.Subscription[]);
	
	// Get the active subscription
	const active = subscriptions
		.filter(subscription => subscription.cancel_at_period_end === false)
		.filter(subscription => subscription.status === "active");

	// If the user has an active subscription
	if (active.length > 0) return server;

	// No plan no server
	return false;
	
}
