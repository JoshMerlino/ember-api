import { query } from "../mysql";
import { stripe } from "../stripe";

type ConstructorArgs = {
    userRow: MySQLData.User;
    mfaRow: MySQLData.MFA;
    sessionRow?: MySQLData.Session;
    sessions: MySQLData.Session[];
    authorization?: string;
}

export default class User {

	private static __construct_signature = Symbol("ConstructSignature");
	public readonly id: number;
	public username: string;
	public readonly created_ms: number;
	public mfa_enabled: boolean;
	public email: string;
	public sessions: Auth.Session[];
	public passwd_md5: string;
	public passwd_length: number;
	public passwd_changed_ms: number;
	public authorization: string | null;

	// Get the user by the session ID
	static async fromAuthorization(authorization: string): Promise<User | false> {
		try {
			const [ sessionRow ] = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE session_id = "${ authorization }";`);
			const [ userRow ] = await query<MySQLData.User>(`SELECT * FROM users WHERE id = ${ sessionRow.user };`);
			const [ mfaRow ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${ userRow.id };`);
			const sessions = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE user = "${ userRow.id }";`);
			return new this({ userRow, sessionRow, mfaRow, sessions, authorization }, User.__construct_signature);
		} catch (e) {
			console.error(e);
			return false;
		}
	}

	// Get the user by the user ID
	static async fromID(id: number): Promise<User | false> {
		try {
			const [ userRow ] = await query<MySQLData.User>(`SELECT * FROM users WHERE id = ${ id };`);
			const [ mfaRow ] = await query<MySQLData.MFA>(`SELECT * FROM mfa WHERE user = ${ userRow.id };`);
			const sessions = await query<MySQLData.Session>(`SELECT * FROM sessions WHERE user = "${ userRow.id }";`);
			return new this({ userRow, mfaRow, sessions }, User.__construct_signature);
		} catch (e) {
			console.error(e);
			return false;
		}
	}
	
	constructor({ userRow, mfaRow, sessionRow, sessions, authorization }: ConstructorArgs, __construct_signature: symbol) {

		// Ensure the user class is instantiated through the static methods.
		if (__construct_signature !== User.__construct_signature) throw new Error("ConstructSignature Error");

		// Mark down that the user was initialized and logged in
		if (sessionRow) query<MySQLData.Session>(`UPDATE sessions SET last_used_ms = ${ Date.now() } WHERE session_id = "${ sessionRow.session_id }";`);

		this.id = userRow.id;
		this.username = userRow.username;
		this.created_ms = userRow.created_ms;
		this.email = userRow.email;
		this.mfa_enabled = mfaRow !== undefined && mfaRow.pending === 0;
		this.passwd_changed_ms = userRow.passwd_changed_ms;
		this.passwd_md5 = userRow.passwd_md5;
		this.passwd_length = userRow.passwd_length;
		this.authorization = authorization || null;
		this.sessions = sessions.map(session => <Auth.Session><unknown>{ ...session, current: sessionRow && session.session_id === sessionRow.session_id });

	}
	
	// Get the stripe customer of the user
	public async getCustomer() {
		
		// Get current customer id
		const [ { customer: id } ] = await query<{ customer: string }>(`SELECT customer FROM users WHERE id = ${ this.id };`);

		// Get the customer from Stripe
		return await stripe.customers.retrieve(id)
			.catch(async() => {
				const customer = await stripe.customers.create({
					name: this.username,
					email: this.email,
					metadata: { user: this.id }
				});

				// Update the user's customer ID
				await query(`UPDATE users SET customer = "${ customer.id }" WHERE id = ${ this.id };`);
				return customer;
			});

	}

}
