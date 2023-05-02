declare namespace Ember {

	export interface Server {
		ip: string;
		hash: string;
		location: {
			latitude: number;
			longitude: number;
			countryCode: string;
			country: string;
			state: string;
		};
	}

	// Platform Download
	export interface PlatformDownload {
		version: string;
		files: {
			name: string;
			sha: string;
			arch: string;
			download_url: string;
		}[];
	}

	// Price
	export interface Price {
		isActive: boolean;
		isBestValue: boolean;
		id: string;
		currency: string;
		type: "one-time" | "recurring";
		amount: number;
		interval: number;
		tax: number;
	}

	// Plan
	export interface Plan {
		id: string;
		name: string;
		description: string;
		image: string;
		default_price: string;
		features: string[];
		meta: Record<string, string>;
		prices: Price[];
	}

}