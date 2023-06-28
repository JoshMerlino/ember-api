import { sql } from "../mysql";
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
	public avatar: string | null;

	// Get the user by the session ID
	static async fromAuthorization(authorization: string): Promise<User | false> {
		try {
			const [ sessionRow ] = await sql.unsafe<MySQLData.Session[]>("SELECT * FROM sessions WHERE session_id = $1", [ authorization ]);
			const [ userRow ] = await sql.unsafe<MySQLData.User[]>("SELECT * FROM users WHERE id = $1", [ sessionRow.user ]);
			const [ mfaRow ] = await sql.unsafe<MySQLData.MFA[]>("SELECT * FROM mfa WHERE \"user\" = $1", [ userRow.id ]);
			const sessions = await sql.unsafe<MySQLData.Session[]>("SELECT * FROM sessions WHERE \"user\" = $1", [ userRow.id ]);
			return new this({ userRow, sessionRow, mfaRow, sessions, authorization }, User.__construct_signature);
		} catch (e) {
			console.error(e);
			return false;
		}
	}

	// Get the user by the user ID
	static async fromID(id: number): Promise<User | false> {
		try {
			const [ userRow ] = await sql.unsafe<MySQLData.User[]>("SELECT * FROM users WHERE id = $1;", [ id ]);
			const [ mfaRow ] = await sql.unsafe<MySQLData.MFA[]>("SELECT * FROM mfa WHERE \"user\" = $1;", [ userRow.id ]);
			const sessions = await sql.unsafe<MySQLData.Session[]>("SELECT * FROM sessions WHERE \"user\" = $1;", [ userRow.id ]);
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
		if (sessionRow) sql.unsafe("UPDATE sessions SET last_used_ms = $1 WHERE session_id = $2", [ Date.now(), sessionRow.session_id ]);

		this.id = userRow.id;
		this.username = userRow.username;
		this.created_ms = parseInt(userRow.created_ms || "0");
		this.email = userRow.email;
		this.mfa_enabled = mfaRow !== undefined && !mfaRow.pending;
		this.passwd_changed_ms = parseInt(userRow.passwd_changed_ms || "0");
		this.passwd_md5 = userRow.passwd_md5;
		this.passwd_length = userRow.passwd_length;
		this.authorization = authorization || null;
		this.sessions = sessions.map(session => <Auth.Session><unknown>{ ...session, current: sessionRow && session.session_id === sessionRow.session_id });
		this.avatar = userRow.avatar;

	}
	
	// Get the stripe customer of the user
	public async getCustomer() {
		
		// Get current customer id
		const [ { customer: id } ] = await sql.unsafe<{ customer: string}[]>(
			"SELECT customer FROM users WHERE id = $1",
			[ this.id ]
		);

		// Get the customer from Stripe
		const cus = await stripe.customers.retrieve(id)
			.catch(() => null);
		
		if (!cus) {

			// Make sure a customer with that email doesn't already exist
			const { data: [ existing ] } = await stripe.customers.list({ email: this.email });
			if (existing) return existing.id;
			
			// Create a new customer
			const customer = await stripe.customers.create({
				name: this.username,
				email: this.email,
				metadata: { user: this.id }
			});

			// Update the user's customer ID
			await sql.unsafe("UPDATE users SET customer = $1 WHERE id = $2", [ customer.id, this.id ]);
			return customer;

		}

		return cus;

	}

}
