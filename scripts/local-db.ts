/**
 * Runs a throw-away local PostgreSQL server without Docker, using the
 * `embedded-postgres` binaries. Data lives in `.local-db/` (git-ignored).
 *
 *   npm run db:local          # start and keep running (Ctrl+C to stop)
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const DATA_DIR = path.resolve(process.env.LOCAL_DB_DIR ?? ".local-db");
const DATABASES = ["vocal_impact", "vocal_impact_test"];
const CREDENTIALS = { user: "postgres", password: "postgres" };

/**
 * Creates any missing databases. Uses its own client (always closed) instead of
 * `EmbeddedPostgres#createDatabase`, which leaks its connection when the
 * database already exists and later logs ECONNRESET errors.
 */
async function ensureDatabases(names: string[]): Promise<void> {
  const client = new Client({ ...CREDENTIALS, host: "localhost", port: PORT, database: "postgres" });
  await client.connect();
  try {
    for (const name of names) {
      const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      if (rowCount === 0) await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    ...CREDENTIALS,
    port: PORT,
    persistent: true,
    onLog: () => {},
  });

  const isFirstRun = !existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (isFirstRun) await pg.initialise();
  await pg.start();
  await ensureDatabases(DATABASES);

  console.log(`Local PostgreSQL ready on postgresql://postgres:postgres@localhost:${PORT}`);
  console.log(`Databases: ${DATABASES.join(", ")}. Press Ctrl+C to stop.`);

  const shutdown = async (): Promise<void> => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
