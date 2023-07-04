declare namespace MySQLData {

	export interface User {
		id: number;
		username: string;
		email: string;
		passwd_md5: string;
		passwd_length: number;
		passwd_changed_ms: string;
		created_ms: string;
		customer: string;
		avatar: string;
	}

	export interface Session {
		session_id: string;
		user: number;
		md5: string;
		created_ms: number;
		last_used_ms: number;
		user_agent: string;
		ip_address: string;
	}

	export interface MFA {
		user: number;
		secret: string;
		pending: boolean;
	}

	export interface SSO {
		user: number;
		ssokey: string;
		expires_after: number;
		prevent_authorization: boolean;
	}
	
	export interface Server {
		uuid: string
		latitude: number
		longitude: number
		location: string
		ipv4: string
		port: number
		proto: string
		internal: string
	}

	export interface PendingIntents {
		user: number;
		intent: string;
		secret: string;
	}

}

declare type APIResponse = Record<string, unknown>;

declare interface Endpoint {
	route: string | string[];
	default(req: Request, res: Response): unknown;
}

declare interface Middleware {
	default(req: Request, res: Response, next: NextFunction): void | Promise<void>;
}

declare interface Runtime {
	default(app: Express): void | Promise<void>;
}