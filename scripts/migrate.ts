import { createDb } from "../db/client";
import { applySchema } from "../db/schema";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const db = createDb(url, process.env.TURSO_AUTH_TOKEN);
await applySchema(db.$client);
console.log(`Schema applied to ${url.startsWith("file:") ? url : "Turso"}.`);
db.$client.close();
