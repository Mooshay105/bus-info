import { createClient } from "@libsql/client";
import { applySchema } from "../db/schema";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
await applySchema(client);
console.log(`Schema applied to ${url.startsWith("file:") ? url : "Turso"}.`);
client.close();
