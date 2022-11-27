import { query } from "../mysql";

export type ConstructorArgs = {
    userRow: MySQLData.User;
    mfaRow: MySQLData.MFA;
    sessionRow?: MySQLData.Session;
    sessions: MySQLData.Session[];
    roles: MySQLData.Role[];
    authorization?: string;
}

export default class User {

	private static __construct_signature = Symbol("ConstructSignature");

	public readonly id: number;

	public username: string;

	public readonly created_ms: number;

	public mfa_enabled: boolean;

	public readonly avatar_url: string;

	public email: string;

	public sessions: Auth.Session[];

	public passwd_md5: string;

	public passwd_length: number;

	public passwd_changed_ms: number;

	public authorization: string | null;

	public roles: Auth.Role[];

	public flags: Auth.BitField<Auth.Flags>;

	constructor({ userRow, mfaRow, sessionRow, sessions, roles, authorization }: ConstructorArgs, __construct_signature: symbol) {

		// Ensure the user class is instantiated through the static methods.
		if (__construct_signature !== User.__construct_signature) throw new Error("ConstructSignature Error");

    	// Mark down that the user was initialized and logged in
    	if (sessionRow) query<MySQLData.Session>(`UPDATE sessions SET last_used_ms = ${Date.now()} WHERE session_id = "${sessionRow.session_id}";`);

    	this.id = userRow.id;
    	this.username = userRow.username;
    	this.created_ms = userRow.created_ms;
    	this.email = userRow.email;
    	this.mfa_enabled = mfaRow !== undefined && mfaRow.pending === 0;
    	this.avatar_url = `/api/v1/user/avatar/${userRow.id}`;
    	this.passwd_changed_ms = userRow.passwd_changed_ms;
    	this.passwd_md5 = userRow.passwd_md5;
    	this.passwd_length = userRow.passwd_length;
    	this.authorization = authorization || null;
    	this.roles = roles.map(role => <Auth.Role>role).filter(role => userRow.roles.split(":").includes(role.id.toString()));
		this.flags = userRow.flags || 0;
    	this.sessions = sessions.map(session => <Auth.Session><unknown>{ ...session, current: sessionRow && session.session_id === sessionRow.session_id });

	}

	// Get the user by the session ID
	static async fromAuthorization(authorization: string): Promise<User | false> {
    	try {
			const [ sessionRow ] = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE session_id = "${authorization}";`);
			const [ userRow ] = await query<MySQLData.User>(`SELECT * FROM users WHERE id = ${sessionRow.user};`);
			const [ mfaRow ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${userRow.id};`);
			const sessions = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE user = "${userRow.id}";`);
			const roles = await query<MySQLData.Role>("SELECT * FROM roles");
			return new this({ userRow, sessionRow, mfaRow, sessions, roles, authorization }, User.__construct_signature);
		} catch (e) {
			console.error(e);
			return false;
		}
	}

	// Get the user by the user ID
	static async fromID(id: number): Promise<User | false> {
		try {
			const [ userRow ] = await query<MySQLData.User>(`SELECT * FROM users WHERE id = ${id};`);
			const [ mfaRow ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${userRow.id};`);
			const sessions = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE user = "${userRow.id}";`);
			const roles = await query<MySQLData.Role>("SELECT * FROM roles");
    	return new this({ userRow, mfaRow, sessions, roles }, User.__construct_signature);
		} catch (e) {
			console.error(e);
			return false;
		}
	}

	// Return the user as a User with safe values
	toSafe(): Partial<this> {
    	const user = this as Partial<this>;
    	delete user.passwd_changed_ms;
    	delete user.passwd_length;
    	delete user.passwd_md5;
    	delete user.sessions;
    	delete user.roles;
    	return user;
	}

	// Boolean to determin if user has a permission bitfield
	hasFlag(permission: Auth.Flags): boolean {
		return [ ...this.roles, { flags: this.flags } ].filter(({ flags }) => flags & permission).length > 0;
	}

	async setFlag(flag: Auth.Flags, value: boolean): Promise<void> {
		if (value) this.flags |= flag;
		else this.flags &= ~flag;
		await query(`UPDATE users SET flags = ${this.flags} WHERE id = ${this.id};`);
	}

	// Boolean to determin if user has a role
	hasRole(role: Auth.Role): boolean {
		return this.roles.includes(role);
	}

	// Give the user a role
	async giveRole(role: Auth.Role): Promise<boolean> {
		if (this.hasRole(role)) return false;
		this.roles.push(role);
		await query(`UPDATE users SET roles = "${this.roles.map(role => role.id).join(":")}" WHERE id = ${this.id};`);
		return true;
	}

}
