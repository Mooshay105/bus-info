import type { Client } from "@libsql/client";
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Country } from "../lib/types";

/** SQL default that stamps a row with the current UTC time as "YYYY-MM-DD HH:MM:SS". */
const NOW = sql`(datetime('now'))`;

/** Bus operators. A name is unique within a country. */
export const operators = sqliteTable(
  "operators",
  {
    /** Internal id. */
    id: integer().primaryKey({ autoIncrement: true }),
    /** Operator name, e.g. "SL (Stockholm)". */
    name: text().notNull(),
    /** Country the operator runs in. */
    country: text().$type<Country>().notNull(),
    /** Region within the country, if known. */
    region: text(),
    /** Realtime feed the operator's buses appear in. */
    feed_id: text(),
  },
  (t) => [unique().on(t.name, t.country)],
);

/** Buses, from curated data, DVLA lookups and realtime feeds. */
export const buses = sqliteTable(
  "buses",
  {
    /** Internal id used in URLs. */
    id: integer().primaryKey({ autoIncrement: true }),
    /** Country the bus is registered in. */
    country: text().$type<Country>().notNull(),
    /** Number plate as written. */
    plate: text(),
    /** Plate passed through normalizeKey, for lookups. */
    plate_norm: text(),
    /** Fleet number painted on the bus. */
    fleet_number: text(),
    /** Fleet number passed through normalizeKey, for lookups. */
    fleet_norm: text(),
    /** 1 when the fleet number was guessed from the feed's vehicle id and nobody has confirmed it yet. */
    fleet_guessed: integer().notNull().default(0),
    /** Vehicle id used by the realtime feed. */
    gtfs_vehicle_id: text(),
    /** Feed vehicle id passed through normalizeKey, for lookups. */
    gtfs_norm: text(),
    /** Id of the realtime feed this bus appears in. */
    feed_id: text(),
    /** Operator of the bus. */
    operator_id: integer().references(() => operators.id),
    /** Chassis or vehicle manufacturer. */
    make: text(),
    /** Model name. */
    model: text(),
    /** Bodywork. */
    body: text(),
    /** Year the bus was built. */
    year_built: integer(),
    /** First registration as "YYYY-MM" or "YYYY-MM-DD". */
    first_registered: text(),
    /** Fuel or drivetrain. */
    fuel: text(),
    /** Main colour or livery. */
    colour: text(),
    /** "active", "withdrawn" or "unknown". */
    status: text().notNull().default("active"),
    /** Where the record came from: "curated", "dvla" or "feed". */
    source: text().notNull().default("curated"),
    /** When the row was created. */
    created_at: text().notNull().default(NOW),
    /** When the row was last changed. */
    updated_at: text().notNull().default(NOW),
  },
  (t) => [
    index("buses_plate_norm").on(t.plate_norm),
    index("buses_fleet_norm").on(t.fleet_norm),
    index("buses_gtfs_norm").on(t.gtfs_norm),
    uniqueIndex("buses_feed_vehicle").on(t.feed_id, t.gtfs_vehicle_id),
  ],
);

/** Photos uploaded by users, hidden until an admin approves them. */
export const photos = sqliteTable(
  "photos",
  {
    /** Internal id. */
    id: integer().primaryKey({ autoIncrement: true }),
    /** Bus in the photo. */
    bus_id: integer()
      .notNull()
      .references(() => buses.id, { onDelete: "cascade" }),
    /** Public image URL. */
    url: text().notNull(),
    /** UploadThing file key. */
    file_key: text(),
    /** Clerk id of the uploader. */
    user_id: text().notNull(),
    /** Display name of the uploader. */
    author: text(),
    /** "pending", "approved" or "rejected". */
    status: text().notNull().default("pending"),
    /** When the photo was uploaded. */
    created_at: text().notNull().default(NOW),
  },
  (t) => [index("photos_bus").on(t.bus_id, t.status)],
);

/** Changes users suggested, waiting for an admin. A null bus_id proposes a new bus. */
export const edits = sqliteTable(
  "edits",
  {
    /** Internal id. */
    id: integer().primaryKey({ autoIncrement: true }),
    /** Bus to change, or null for a new bus. */
    bus_id: integer().references(() => buses.id, { onDelete: "cascade" }),
    /** Clerk id of the user who suggested it. */
    user_id: text().notNull(),
    /** Display name of the user who suggested it. */
    author: text(),
    /** JSON object of BusChanges. */
    changes: text().notNull(),
    /** "pending", "approved" or "rejected". */
    status: text().notNull().default("pending"),
    /** When the edit was suggested. */
    created_at: text().notNull().default(NOW),
  },
  (t) => [index("edits_status").on(t.status)],
);

/** Newest known position of each bus. */
export const lastSeen = sqliteTable("last_seen", {
  /** Bus the position belongs to. */
  bus_id: integer()
    .primaryKey()
    .references(() => buses.id, { onDelete: "cascade" }),
  /** Latitude in degrees. */
  lat: real().notNull(),
  /** Longitude in degrees. */
  lon: real().notNull(),
  /** Heading in degrees, if known. */
  bearing: real(),
  /** Speed in metres per second, if known. */
  speed: real(),
  /** Route id, if known. */
  route_id: text(),
  /** Unix time in seconds. */
  seen_at: integer().notNull(),
});

/** SQL that creates every table and index on a new database. Safe to run repeatedly. Must stay in step with the tables above. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  feed_id TEXT,
  UNIQUE (name, country)
);

CREATE TABLE IF NOT EXISTS buses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  plate TEXT,
  plate_norm TEXT,
  fleet_number TEXT,
  fleet_norm TEXT,
  fleet_guessed INTEGER NOT NULL DEFAULT 0,
  gtfs_vehicle_id TEXT,
  gtfs_norm TEXT,
  feed_id TEXT,
  operator_id INTEGER REFERENCES operators (id),
  make TEXT,
  model TEXT,
  body TEXT,
  year_built INTEGER,
  first_registered TEXT,
  fuel TEXT,
  colour TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'curated',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS buses_plate_norm ON buses (plate_norm);
CREATE INDEX IF NOT EXISTS buses_fleet_norm ON buses (fleet_norm);
CREATE INDEX IF NOT EXISTS buses_gtfs_norm ON buses (gtfs_norm);
CREATE UNIQUE INDEX IF NOT EXISTS buses_feed_vehicle ON buses (feed_id, gtfs_vehicle_id);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id INTEGER NOT NULL REFERENCES buses (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  file_key TEXT,
  user_id TEXT NOT NULL,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS photos_bus ON photos (bus_id, status);

CREATE TABLE IF NOT EXISTS edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id INTEGER REFERENCES buses (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  author TEXT,
  changes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS edits_status ON edits (status);

CREATE TABLE IF NOT EXISTS last_seen (
  bus_id INTEGER PRIMARY KEY REFERENCES buses (id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  bearing REAL,
  speed REAL,
  route_id TEXT,
  seen_at INTEGER NOT NULL
);
`;

/** Column additions for databases created before the column existed. Each runs once and is skipped if already applied. */
export const MIGRATIONS = ["ALTER TABLE buses ADD COLUMN fleet_guessed INTEGER NOT NULL DEFAULT 0"];

/**
 * Creates missing tables and indexes, then adds any missing columns.
 * @param client libSQL client to apply the schema to.
 */
export async function applySchema(client: Client): Promise<void> {
  await client.executeMultiple(SCHEMA);
  for (const sql of MIGRATIONS) {
    try {
      await client.execute(sql);
    } catch (error) {
      if (!String(error).includes("duplicate column")) throw error;
    }
  }
}
