import postgres from "postgres";
const { POSTGRES } = process.env;
if (!POSTGRES) throw new Error("Missing Postgres environment variables");

const _sql = postgres(POSTGRES, { ssl: "require" });
const unsafe = _sql.unsafe;

_sql.unsafe = function(...args) {
	console.log(...args);
	return unsafe(...args);
};

export const sql = _sql;

sql`select version()`.then(([ { version } ]) => console.info(`Postgres version: ${ version }`));