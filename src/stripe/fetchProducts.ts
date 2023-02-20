import Stripe from "stripe";
import { stripe } from ".";

export type Product = Stripe.Product & { price: Stripe.Price };

/** Fetches all the products available on the store */
export default async function fetchProducts() {

	// Load raw yaml
	const { data } = await stripe.products.list({ limit: 100 });

	// Fill in the rest of the info from stripe
	return await Promise.allSettled(data.map(async product => {
		const price = await stripe.prices.retrieve(<string>product.default_price);
		return { ...product, price };
	})).then(results => results

		// Filter out any errors
		.filter(result => result.status === "fulfilled")
		.map(result => (<{ value: Product }>result).value)

		// Filter out archived or hidden products
		.filter(product => product.active && !product.metadata.hidden)

		// Sort by price
		.sort((a, b) => (a.price.unit_amount ?? 0) - (b.price.unit_amount ?? 0)));

}
