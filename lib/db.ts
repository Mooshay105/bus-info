import "server-only";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { applySchema } from "@/db/schema";

let client: Client | undefined;
let ready: Promise<void> | undefined;

/**
 * Returns the shared libSQL client, creating it on first use.
 * Uses Turso when TURSO_DATABASE_URL is set; otherwise a local SQLite file (local.db, or /tmp on Vercel).
 * @returns The libSQL client.
 */
function db(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? "file:/tmp/buss-info.db" : "file:local.db");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  }
  return client;
}

/**
 * Waits until the database is ready, applying the schema the first time.
 * The schema promise is shared per process, but a failure (e.g. a fetch aborted when a
 * prerender ends) is not cached: the next call retries instead of failing forever.
 * @returns The libSQL client.
 */
export async function readyDb(): Promise<Client> {
  const c = db();
  ready ??= applySchema(c).catch((err: unknown) => {
    ready = undefined;
    throw err;
  });
  await ready;
  return c;
}

/**
 * Runs a query and returns its rows as plain objects of the given shape.
 * @param statement SQL string or statement with arguments.
 * @returns The result rows, copied into plain objects so they can cross the server/client boundary.
 */
export async function query<T>(statement: InStatement): Promise<T[]> {
  const result = await (await readyDb()).execute(statement);
  return result.rows.map((row) => ({ ...row }) as T);
}

/**
 * Runs a query and returns the first row, if any.
 * @param statement SQL string or statement with arguments.
 * @returns The first row, or undefined when the query returns nothing.
 */
export async function queryOne<T>(statement: InStatement): Promise<T | undefined> {
  const rows = await query<T>(statement);
  return rows[0];
}
