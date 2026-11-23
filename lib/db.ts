import "server-only";
import { createDb, type Db } from "@/db/client";
import { applySchema } from "@/db/schema";

let database: Db | undefined;
let ready: Promise<void> | undefined;

/**
 * Returns the Drizzle database once it is ready, applying the schema the first time.
 * Uses Turso when TURSO_DATABASE_URL is set; otherwise a local SQLite file (local.db, or /tmp on Vercel).
 * The schema promise is shared per process, but a failure (e.g. a fetch aborted when a
 * prerender ends) is not cached: the next call retries instead of failing forever.
 * @returns The database.
 */
export async function getDb(): Promise<Db> {
  database ??= createDb(
    process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? "file:/tmp/buss-info.db" : "file:local.db"),
    process.env.TURSO_AUTH_TOKEN,
  );
  ready ??= applySchema(database.$client).catch((err: unknown) => {
    ready = undefined;
    throw err;
  });
  await ready;
  return database;
}
