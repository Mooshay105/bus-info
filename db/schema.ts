import type { Client } from "@libsql/client";

/** SQL that creates every table and index. Safe to run repeatedly. */
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
