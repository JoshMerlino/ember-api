declare namespace Ember {
	export interface Server {
		ip: string
		iface: string
		network: string
		subnet: string
		port: string
		proto: string
		hostname: string
		hash: string
		ping: number | false;
		location: Location
	}

	export interface Location {
		ip: string
		continent_code: string
		continent_name: string
		country_code2: string
		country_code3: string
		country_name: string
		country_capital: string
		state_prov: string
		district: string
		city: string
		zipcode: string
		latitude: string
		longitude: string
		is_eu: boolean
		calling_code: string
		country_tld: string
		languages: string
		country_flag: string
		geoname_id: string
		isp: string
		connection_type: string
		organization: string
		currency: Currency
		time_zone: TimeZone
	}

	export interface Currency {
		code: string
		name: string
		symbol: string
	}

	export interface TimeZone {
		name: string
		offset: number
		current_time: string
		current_time_unix: number
		is_dst: boolean
		dst_savings: number
	}

}
