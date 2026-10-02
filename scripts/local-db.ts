/**
 * Runs a throw-away local PostgreSQL server without Docker, using the
 * `embedded-postgres` binaries. Data lives in `.local-db/` (git-ignored).
 *
 *   npm run db:local          # start and keep running (Ctrl+C to stop)
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const DATA_DIR = path.resolve(process.env.LOCAL_DB_DIR ?? ".local-db");
const DATABASES = ["vocal_impact", "vocal_impact_test"];

async function main(): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
    onLog: () => {},
  });

  const isFirstRun = !existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (isFirstRun) await pg.initialise();
  await pg.start();

  for (const name of DATABASES) {
    try {
      await pg.createDatabase(name);
    } catch {
      // Already exists — nothing to do.
    }
  }

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
