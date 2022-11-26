import chalk from "chalk";
import mysql from "mysql2";
import credentials from "./credentials";

export const connection = mysql.createConnection(credentials);

connection.connect((err) => {
	if (err) {
		console.error("Could not connect to MySQL server.", err);
	} else {
		console.info(chalk.cyan("SQL"), "Connected to MySQL server.");
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
