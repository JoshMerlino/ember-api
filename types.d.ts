declare namespace MySQLData {

	export interface User {
		id: number;
		username: string;
		email: string;
		passwd_md5: string;
		passwd_length: number;
		passwd_changed_ms: number;
		created_ms: number;
		roles: string;
		flags: number;
	}

	export interface Session {
		id: number;
		session_id: string;
		user: number;
		md5: string;
		created_ms: number;
		last_used_ms: number;
		user_agent: string;
		ip_address: string;
	}

	export interface MFA {
		id: number;
		user: number;
		secret: string;
		pending: 0 | 1;
	}

	export interface SSO {
		id: number;
		user: number;
		ssokey: string;
		expires_after: number;
		prevent_authorization: boolean;
	}

	export interface Role {
		id: number;
		name: string;
		color: number;
		flags: number;
	}

	export interface Server {
		id: number
		uuid: string
		address: string
		latitude: number
		longitude: number
		location: string
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