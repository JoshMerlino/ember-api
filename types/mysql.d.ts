/* eslint camelcase: off */

declare namespace MySQLData {

	declare interface User {
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

	declare interface Session {
		id: number;
		session_id: string;
		user: number;
		md5: string;
		created_ms: number;
		last_used_ms: number;
		user_agent: string;
		ip_address: string;
	}

	declare interface MFA {
		id: number;
		user: number;
		secret: string;
		pending: 0 | 1;
	}

	declare interface SSO {
		id: number;
		user: number;
		ssokey: string;
		expires_after: number;
	}

	declare interface Role {
		id: number;
		name: string;
		color: number;
		flags: number;
	}

}
