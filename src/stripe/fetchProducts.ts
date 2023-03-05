import Stripe from "stripe";
import { stripe } from ".";

export type Product = Stripe.Product & { price: Stripe.Price };

/** Fetches all the products available on the store */
export default async function fetchProducts() {

	// Load raw yaml
	const { data } = await stripe.products.list({
		limit: 100,
		active: true,
		expand: [ "data.default_price" ]
	});

	return data;

}
