import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit settings, for `bun run db:studio`.
 * The tables are created by db/schema.ts's SCHEMA (bun run db:migrate), not drizzle-kit.
 * Don't run drizzle-kit push: it wants to rebuild every table because SQLite reports INTEGER PRIMARY KEY columns as nullable.
 */
export default defineConfig({
  dialect: "turso",
  schema: "./db/schema.ts",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || "file:local.db",
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
});
