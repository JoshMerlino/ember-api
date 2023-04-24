declare namespace REST {
	type APIResponse<T = unknown> = T & { success: true } | APIError;
	type Status = `${ number } ${ string }`;
	interface APIError {
		success: false;
		error: Status;
		description?: string;
		readable?: string;
	}
}

declare namespace Auth {
	interface Meta {
		id: number;
		subscription?: string;
	}
	interface Session {
		id: number;
        session_id: string;
        created_ms: number;
        last_used_ms: number;
        user_agent: string;
        ip_address: string;
        current: boolean;
	}
	interface User {
		id: number;
		username: string;
		email: string;
		created_ms: number;
		mfa_enabled: boolean;
		passwd_md5: string;
		passwd_length: number;
		passwd_changed_ms: number;
		sessions: Session[];
		meta: Meta
	}
}

interface File {
	name: string;
	sha: string;
	arch: string;
	download_url: string;
}
interface PlatformDownloads {
	version: string;
	files: File[];
}
declare namespace EmberAPI {
	interface ClientDownloads {
		platform: Record<string, PlatformDownloads>;
	}
}