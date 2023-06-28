import postgres from "postgres";
const { POSTGRES } = process.env;
if (!POSTGRES) throw new Error("Missing Postgres environment variables");

export const sql = postgres(POSTGRES, { ssl: "require" });
sql`select version()`.then(([ { version } ]) => console.info(`Postgres version: ${ version }`));