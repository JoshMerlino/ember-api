import User from "../auth/User";
import { query } from "../mysql";
import { stripe } from "../stripe";

export async function getServers(hash?: string | null, user?: User): Promise<Ember.Server[]> {

	const serverRow = await query<MySQLData.Server>(hash ? `SELECT * FROM servers WHERE uuid="${ hash }"` : "SELECT * FROM servers;");
	if (!serverRow) throw new Error("No servers found");

	// Loop through servers
	return await Promise.all(serverRow.map(server => {
		const [ proto, ip, port, network, subnet ] = server.address
			.split(" ")
			.map(a => a.trim());

		const [ code, country, state ] = server.location.split(";").map(a => a.trim());
		return {
			ip,
			proto,
			hash: server.uuid,
			port: parseInt(port),
			network,
			subnet,
			location: {
				latitude: server.latitude / 1e10,
				longitude: server.longitude / 1e10,
				countryCode: code.split("_")[1],
				country,
				state
			}
		};
	}).map(async server => {
		if (!user) return server;
		
		// Get the users customer id
		const customer = await user.getCustomer().then(customer => customer.id);

		// Get the users subscription
		const subscriptions = await stripe.subscriptions.list({ customer })
			.then(({ data }) => data);
			
		// Get the active subscription
		const active = subscriptions
			.filter(subscription => subscription.cancellation_details?.reason === null)
			.filter(subscription => subscription.status === "active");
			
		console.log(active.length);
		
		if (active.length === 0) return false;

		// If the user has an active subscription
		return server;

	})).then(servers => servers.filter(server => server !== false) as Ember.Server[]);
}
