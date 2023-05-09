import { Request, Response } from "express";
import { publicKey, stripe } from "../../src/stripe";

// Map of units to their amount of days
const days = {
	"day": 1,
	"week": 7,
	"month": 30,
	"year": 365
};

// Create cache
const plans: Record<string, Ember.Plan> = {};
setInterval(async function cache() {
	
	// Get all packages
	const { data } = await stripe.products.list({
		limit: 100,
		expand: [ "data.default_price", "data.price" ]
	});

	// Fill cache with new data
	await Promise.all(data.filter(a => a.active).map(async product => ({
		id: product.id,
		name: product.name,
		description: product.description || product.name,
		image: product.images[0],
		features: "features" in product.metadata ? product.metadata.features.split(";").map(a => a.trim()) : [],
		meta: product.metadata || {},
		default_price: typeof product.default_price === "string" ? product.default_price : product.default_price?.id,
		prices: await stripe.prices.list({
			product: product.id,
			active: true
		}).then(({ data }) => data.map(price => ({
			id: price.id,
			currency: price.currency,
			type: price.type,
			tax: price.tax_behavior === "inclusive" ? 0 : ((price.unit_amount || 0) / 100) * 0.06,
			amount: (price.unit_amount || 0) / 100,
			interval: price.recurring ? price.recurring.interval_count * days[price.recurring.interval] : -1,
		} as Ember.Price))).catch(() => [])
	}))).then(d => d.forEach(plan => plans[plan.id] = plan as Ember.Plan));

	// Remove inactive packages
	Object.values(data).filter(a => !a.active).forEach(product => delete plans[product.id]);

}, 1000);

export const route = "v2/ember/plans";
export default async function api(req: Request, res: Response) {

	// Hold request until cache is ready
	if (!Object.keys(plans).length) {
		setTimeout(() => api(req, res), 10);
		return;
	}
	
	// Return the packages
	res.json({
		success: true,
		plans,
		token: publicKey,
	} as EmberAPI.Store);

}