import type { Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

/** Drizzle database typed with every table in db/schema.ts. */
export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

/**
 * Opens a Drizzle database on libSQL.
 * @param url libSQL URL: a Turso URL or a "file:" path.
 * @param authToken Turso auth token, if the URL needs one.
 * @returns The database. Its libSQL client is at db.$client.
 */
export function createDb(url: string, authToken?: string): Db {
  return drizzle({ connection: { url, authToken: authToken || undefined }, schema });
}
