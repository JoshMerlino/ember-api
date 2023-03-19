declare namespace Ember {
	interface Server {
        ip: string;
        iface: string;
        network: string;
        subnet: string;
        port: string;
        proto: string;
		hostname: string;
		location: unknown;
    }
}