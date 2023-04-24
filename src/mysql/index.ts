import chalk from "chalk";
import { readFile } from "fs/promises";
import mysql from "mysql2";
import path from "path";
import credentials from "./credentials";

// Create connection pool
const pool = mysql.createPool({
	...credentials,
	connectionLimit: 5
});

(function connect() {

	// Connect to database
	pool.getConnection((err, connection) => {

		// Handle error
		if (err) {
			console.error(chalk.cyan("SQL"), chalk.redBright("Error connecting to database: " + err.message));
			if (process.env.DEVELOPMENT) console.error(err.stack);
			return setTimeout(connect);
		}

		// Log connection
		console.info(chalk.cyan("SQL"), "Connected to database as ID:", chalk.cyan(connection.threadId));

		// Release connection
		connection.release();

	});

}());

// Before process exit
process.on("beforeExit", () => {
	pool.end();
	console.info(chalk.cyan("SQL"), "Disconnected from database");
});

// Initialize database
pool.on("connection", async function() {

	// Get number of tables
	const tables = await query("SHOW TABLES");
	if (tables.length === 0) {
		console.info(chalk.cyan("SQL"), "No tables found, Starting upload.");
		const template = await readFile(path.resolve("src/mysql/template.sql"), "utf8");
		for (let line of template.split(";")) {
			if (line.trim() !== "") {
				line = line.replace(/\s+|\n|\t/g, " ") + ";";
				await query(line);
			}
		}
		console.info(chalk.cyan("SQL"), "Upload complete.");
	}

});

export function query<T = Record<string, unknown>>(query: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		if (process.env.DEVELOPMENT) console.info(chalk.cyan("SQL"), chalk.green("QUERY"), query);
		pool.query(query, function(error, data) {
			if (error !== null) return reject(error);
			resolve(<T[]>data);
		});
	});
}
