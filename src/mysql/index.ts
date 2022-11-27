import chalk from "chalk";
import { readFile } from "fs/promises";
import mysql from "mysql2";
import path from "path";
import credentials from "./credentials";

export const connection = mysql.createConnection(credentials);

connection.connect((err) => {
	if (err) {
		console.error("Could not connect to MySQL server.", err);
	} else {
		console.info(chalk.cyan("SQL"), "Connected to MySQL server.");

		(async function() {

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

		}());

	}
});

export function query<T = Record<string, unknown>>(query: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		if (process.env.DEVELOPMENT) console.info(chalk.cyan("SQL"), chalk.green("QUERY"), query);
		connection.query(query, function(error, data) {
			if (error !== null) return reject(error);
			resolve(<T[]>data);
		});
	});
}
