declare namespace Auth {

    declare type BitField<T> = number;
    declare const enum Flags {
        VERIFIED = 1 << 1,
        LOCKED = 1 << 2,
        ADMINISTRATOR = 1 << 3
    }

    declare type Resolvable<T> = false | null | T;

    declare interface User {
        id: number;
        username: string;
        created_ms: number;
        mfa_enabled: boolean;
        avatar_url: string;
        email: string;
        roles: Role[];
        flags: BitField<Flags>;
    }

    declare interface FullUser extends User {
        passwd_md5: string;
        passwd_length: number;
        passwd_changed_ms: number;
        authorization: string;
    }

    declare interface Role {
        id: number;
        color: number;
        name: string;
        flags: BitField<Flags>;
    }

    declare interface Session {
        id: number;
        session_id: string;
        created_ms: number;
        last_used_ms: number;
        user_agent: UAParser.IResult;
        ip_address: string;
        current_session: boolean;
    }
}
