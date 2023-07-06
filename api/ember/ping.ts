import { Request, Response } from "express";
import { sql } from "../../src/mysql";

// Cache all the timers
const timers: Record<string, NodeJS.Timer> = {};
const strikes: Record<string, number> = {};

// Select all servers and start a timer for them
(async function start_timers() {
	setTimeout(start_timers, 30000);
	await sql<MySQLData.Server[]>`SELECT * FROM servers`.then(servers => servers.map(function(server) {
		
		// Make sure its not already running
		if (timers[server.uuid]) return;

		// Start timer
		strikes[server.uuid] = 0;
		timers[server.uuid] = setInterval(async function() {
			
			// Add strike
			strikes[server.uuid]++;

			// If strikes 3 times, remove server
			if (strikes[server.uuid] >= 3) {
				clearInterval(timers[server.uuid]);
				delete timers[server.uuid];
				delete strikes[server.uuid];
				await sql`DELETE FROM servers WHERE uuid = ${ server.uuid }`;
				console.info(`Removed server ${ server.uuid } due to inactivity.`);
			}
			
		}, 30000);

	}));
}());

export const route = "ember/ping";
export default async function api(req: Request, res: Response): Promise<void | Response> {

	const body = { ...req.query, ...req.body };
	const { hostname } = body;

	// Get server with that ip address
	const [ server ] = await sql<MySQLData.Server[]>`SELECT * FROM servers WHERE ipv4 = ${ hostname };`;
	if (!server) return res.json({ success: false, error: "Server not found." });
	
	// Reset strikes
	strikes[server.uuid] = 0;

	res.json({ success: true });

}