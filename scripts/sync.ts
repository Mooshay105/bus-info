import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { createDb } from "../db/client";
import { selectBuses, upsertLastSeen, upsertOperator } from "../db/queries";
import { applySchema, buses } from "../db/schema";
import { parseCsv } from "../lib/csv";
import { downloadFeed } from "../lib/feeds/download";
import { FEEDS, feedById, fleetNumber, guessFleetFromId, vehicleKey, type FeedConfig } from "../lib/feeds/registry";
import { normalizeKey } from "../lib/normalize";
import { COUNTRIES, EDITABLE_FIELDS, FIRST_REGISTERED_PATTERN, STATUSES, type Country, type VehiclePosition } from "../lib/types";

const USAGE = `Usage: bun run sync [feed id ...] [--changes <file>|none] [--apply] [--deploy]

Pulls buses from the live feeds, merges them with the database, applies the
changes file, and shows what would change. Nothing is written without --apply.

  feed id ...       Feeds to pull (default: all). Feeds without a key are skipped.
  --changes <file>  CSV of fixes (default: data/changes.csv). "none" skips it.
  --apply           Write the result to the database.
  --deploy          For deploy builds: only runs on Vercel production deploys (or
                    outside Vercel), skips when TURSO_DATABASE_URL is unset, and
                    never fails the build.

Feeds: ${FEEDS.map((f) => f.id).join(", ")}`;

type Value = string | number | null;

interface Row {
  id: number | null;
  country: Country;
  plate: string | null;
  fleet_number: string | null;
  fleet_guessed: number;
  gtfs_vehicle_id: string | null;
  feed_id: string | null;
  operator_name: string | null;
  make: string | null;
  model: string | null;
  body: string | null;
  year_built: number | null;
  first_registered: string | null;
  fuel: string | null;
  colour: string | null;
  status: string;
  source: string;
}

const FIELDS = [
  "country",
  "plate",
  "fleet_number",
  "fleet_guessed",
  "gtfs_vehicle_id",
  "feed_id",
  "operator_name",
  "make",
  "model",
  "body",
  "year_built",
  "first_registered",
  "fuel",
  "colour",
  "status",
  "source",
] as const satisfies readonly (keyof Row)[];

const MATCH_COLUMNS = ["bus_id", "feed_id", "match_fleet", "match_plate", "match_vehicle_id"];

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const apply = args.includes("--apply");
if (args.includes("--deploy")) {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") {
    console.log(`Sync skipped: this is a ${vercelEnv} deployment, not production.`);
    process.exit(0);
  }
  if (!process.env.TURSO_DATABASE_URL) {
    console.log("Sync skipped: TURSO_DATABASE_URL is not set.");
    process.exit(0);
  }
  const giveUp = (error: unknown) => {
    console.error("Sync failed, continuing with the build:", error instanceof Error ? error.message : error);
    process.exit(0);
  };
  process.on("uncaughtException", giveUp);
  process.on("unhandledRejection", giveUp);
}
const changesIndex = args.indexOf("--changes");
const changesArg = changesIndex >= 0 ? args[changesIndex + 1] : undefined;
if (changesIndex >= 0 && !changesArg) {
  console.error("--changes needs a file path or none");
  process.exit(1);
}
const feedArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--changes") i++;
  else if (args[i] === "--apply" || args[i] === "--deploy") continue;
  else if (args[i].startsWith("--")) {
    console.error(`Unknown option ${args[i]}\n\n${USAGE}`);
    process.exit(1);
  } else feedArgs.push(args[i]);
}
const selected: FeedConfig[] = [];
for (const id of feedArgs.length === 0 || feedArgs.includes("all") ? ["all"] : feedArgs) {
  if (id === "all") {
    selected.push(...FEEDS);
    continue;
  }
  const feed = feedById(id);
  if (!feed) {
    console.error(`Unknown feed ${id}\n\n${USAGE}`);
    process.exit(1);
  }
  selected.push(feed);
}

const db = createDb(process.env.TURSO_DATABASE_URL || "file:local.db", process.env.TURSO_AUTH_TOKEN);
await applySchema(db.$client);

const loaded: Row[] = await selectBuses(db);

const original = new Map<number, Row>(loaded.map((r) => [r.id as number, { ...r }]));
const rows: Row[] = loaded;
const byVehicle = new Map<string, Row>();
for (const row of rows) if (row.feed_id && row.gtfs_vehicle_id) byVehicle.set(`${row.feed_id}|${row.gtfs_vehicle_id}`, row);
const positions = new Map<Row, VehiclePosition>();

console.log(`Database: ${rows.length} buses\n\nPulling feeds`);
for (const feed of selected) {
  const result = await downloadFeed(feed, 30_000);
  if (!result.ok) {
    console.log(`  ${feed.id}: skipped (${result.reason})`);
    continue;
  }
  const latest = new Map<string, VehiclePosition>();
  for (const vp of result.positions) {
    const key = vehicleKey(feed, vp);
    const seen = key ? latest.get(key) : undefined;
    if (key && (!seen || (vp.timestamp ?? 0) > (seen.timestamp ?? 0))) latest.set(key, vp);
  }
  let added = 0;
  for (const [key, vp] of latest) {
    const fleet = fleetNumber(feed, vp);
    let row = byVehicle.get(`${feed.id}|${key}`);
    if (!row) {
      row = {
        id: null,
        country: feed.country,
        plate: vp.plate,
        fleet_number: fleet?.value ?? null,
        fleet_guessed: fleet?.guessed ? 1 : 0,
        gtfs_vehicle_id: key,
        feed_id: feed.id,
        operator_name: feed.name,
        make: null,
        model: null,
        body: null,
        year_built: null,
        first_registered: null,
        fuel: null,
        colour: null,
        status: "active",
        source: "feed",
      };
      rows.push(row);
      byVehicle.set(`${feed.id}|${key}`, row);
      added++;
    } else {
      row.plate ??= vp.plate;
      row.operator_name ??= feed.name;
      if (row.fleet_number == null && fleet) {
        row.fleet_number = fleet.value;
        row.fleet_guessed = fleet.guessed ? 1 : 0;
      }
    }
    positions.set(row, vp);
  }
  if (feed.guessFleet) {
    for (const row of rows) {
      if (row.feed_id !== feed.id || (row.fleet_number != null && !row.fleet_guessed)) continue;
      const guess = guessFleetFromId(feed, row.gtfs_vehicle_id);
      row.fleet_number = guess?.value ?? null;
      row.fleet_guessed = guess ? 1 : 0;
    }
  }
  console.log(`  ${feed.id}: ${latest.size} vehicles, ${added} new`);
}

const changedByFile = new Set<Row>();
const changesPath = changesArg ?? "data/changes.csv";
const warnings: string[] = [];
if (changesArg !== "none") {
  const file = Bun.file(changesPath);
  if (!(await file.exists())) {
    if (changesArg) {
      console.error(`\nChanges file ${changesPath} not found`);
      process.exit(1);
    }
    console.log(`\nNo ${changesPath}, so no fixes to apply`);
  } else {
    const records = parseCsv(await file.text());
    console.log(`\nApplying ${records.length} rows from ${changesPath}`);
    const known = new Set<string>([...MATCH_COLUMNS, ...EDITABLE_FIELDS]);
    const unknown = Object.keys(records[0]?.values ?? {}).filter((c) => !known.has(c));
    if (unknown.length > 0) warnings.push(`Ignored unknown columns: ${unknown.join(", ")}`);

    for (const { line, values } of records) {
      const where = `line ${line}`;
      const busId = values.bus_id ? Number(values.bus_id) : null;
      if (busId !== null && !(Number.isInteger(busId) && busId > 0)) {
        warnings.push(`${where}: invalid bus_id "${values.bus_id}", use the number from the bus page address`);
        continue;
      }
      if (!busId && !values.match_fleet && !values.match_plate && !values.match_vehicle_id) {
        warnings.push(`${where}: needs bus_id or one of match_fleet, match_plate, match_vehicle_id`);
        continue;
      }
      const matches = rows.filter(
        (r) =>
          (!busId || r.id === busId) &&
          (!values.feed_id || r.feed_id === values.feed_id) &&
          (!values.match_fleet || normalizeKey(r.fleet_number) === normalizeKey(values.match_fleet)) &&
          (!values.match_plate || normalizeKey(r.plate) === normalizeKey(values.match_plate)) &&
          (!values.match_vehicle_id || normalizeKey(r.gtfs_vehicle_id) === normalizeKey(values.match_vehicle_id)),
      );
      const label = MATCH_COLUMNS.filter((c) => values[c]).map((c) => `${c}=${values[c]}`).join(" ");
      if (matches.length === 0) {
        warnings.push(`${where}: no bus matches ${label}`);
        continue;
      }
      if (matches.length > 1) {
        const ids = matches.slice(0, 5).map((r) => (r.id ? `#${r.id}` : `new ${r.feed_id}/${r.gtfs_vehicle_id}`));
        warnings.push(`${where}: ${matches.length} buses match ${label} (${ids.join(", ")}${matches.length > 5 ? ", …" : ""}); add more match columns`);
        continue;
      }
      const row = matches[0];
      let bad = false;
      const sets: [keyof Row, Value][] = [];
      for (const field of EDITABLE_FIELDS) {
        const raw = values[field];
        if (raw === undefined || raw === "") continue;
        const value = raw === "-" ? null : raw;
        if (field === "country" && !COUNTRIES.includes(value as never)) bad = true;
        if (field === "year_built" && value !== null && !/^\d{4}$/.test(value)) bad = true;
        if (field === "status" && !STATUSES.includes(value ?? "")) bad = true;
        if (field === "first_registered" && value !== null && !new RegExp(`^${FIRST_REGISTERED_PATTERN}$`).test(value)) bad = true;
        if (bad) {
          warnings.push(`${where}: invalid ${field} "${raw}"`);
          break;
        }
        sets.push([field, field === "year_built" && value !== null ? Number(value) : value]);
      }
      if (bad) continue;
      for (const [field, value] of sets) {
        (row as unknown as Record<string, Value>)[field] = value;
        if (field === "fleet_number") row.fleet_guessed = 0;
      }
      if (sets.length > 0) changedByFile.add(row);
    }
  }
}

const same = (a: Value | undefined, b: Value | undefined) => (a == null ? "" : String(a)) === (b == null ? "" : String(b));
const inserts = rows.filter((r) => r.id === null);
const updates = rows
  .filter((r) => r.id !== null)
  .map((r) => ({ row: r, fields: FIELDS.filter((f) => !same(r[f], original.get(r.id as number)?.[f])) }))
  .filter((u) => u.fields.length > 0);

if (changedByFile.size > 0) {
  console.log("\nFixes from the changes file");
  for (const row of changedByFile) {
    const before = row.id ? original.get(row.id) : undefined;
    const name = row.id ? `#${row.id}` : `new bus ${row.feed_id}/${row.gtfs_vehicle_id}`;
    const fields = FIELDS.filter((f) => f !== "fleet_guessed" && !same(row[f], before?.[f]));
    const confirmed = Boolean(before?.fleet_guessed) && !row.fleet_guessed && same(row.fleet_number, before?.fleet_number);
    if (fields.length === 0 && !confirmed) {
      console.log(`  ${name}: already up to date`);
      continue;
    }
    console.log(`  ${name} (${row.feed_id ?? row.country} ${row.fleet_number ?? row.plate ?? row.gtfs_vehicle_id})`);
    for (const f of fields) console.log(`    ${f}: ${before?.[f] ?? "∅"} → ${row[f] ?? "∅"}`);
    if (confirmed) console.log(`    fleet_number: ${row.fleet_number} confirmed (no longer probable)`);
  }
}

if (warnings.length > 0) {
  console.log("\nWarnings");
  for (const w of warnings) console.log(`  ${w}`);
}

const guessChanges = updates.filter((u) => u.fields.includes("fleet_number") && !changedByFile.has(u.row)).length;
console.log(`\nSummary
  ${inserts.length} new buses
  ${updates.length} buses updated (${updates.filter((u) => changedByFile.has(u.row)).length} by the changes file, ${guessChanges} fleet number guesses)
  ${positions.size} positions`);

if (!apply) {
  console.log("\nDry run: nothing written. Run again with --apply to save.");
  db.$client.close();
  process.exit(0);
}

const operatorIds = new Map<string, number>();
const operatorKey = (r: Row) => `${r.country}|${r.operator_name}`;
for (const row of [...inserts, ...updates.map((u) => u.row)]) {
  if (!row.operator_name || operatorIds.has(operatorKey(row))) continue;
  const feed = feedById(row.feed_id);
  const result = await upsertOperator(db, row.operator_name, row.country, feed && feed.name === row.operator_name ? feed.id : null).get();
  operatorIds.set(operatorKey(row), result!.id);
}

const columns = (r: Row): typeof buses.$inferInsert => ({
  country: r.country,
  plate: r.plate,
  plate_norm: r.plate ? normalizeKey(r.plate) : null,
  fleet_number: r.fleet_number,
  fleet_norm: r.fleet_number ? normalizeKey(r.fleet_number) : null,
  fleet_guessed: r.fleet_guessed ? 1 : 0,
  gtfs_vehicle_id: r.gtfs_vehicle_id,
  gtfs_norm: r.gtfs_vehicle_id ? normalizeKey(r.gtfs_vehicle_id) : null,
  feed_id: r.feed_id,
  operator_id: r.operator_name ? (operatorIds.get(operatorKey(r)) ?? null) : null,
  make: r.make,
  model: r.model,
  body: r.body,
  year_built: r.year_built,
  first_registered: r.first_registered,
  fuel: r.fuel,
  colour: r.colour,
  status: r.status,
  source: r.source,
});

const inBatches = async <T extends BatchItem<"sqlite">>(queries: T[]) => {
  const results = [];
  for (let i = 0; i < queries.length; i += 200) {
    const chunk = queries.slice(i, i + 200) as [T, ...T[]];
    results.push(...(await db.batch(chunk)));
  }
  return results;
};

const insertResults = (await inBatches(
  inserts.map((r) => db.insert(buses).values(columns(r)).returning({ id: buses.id })),
)) as { id: number }[][];
inserts.forEach((r, i) => (r.id = insertResults[i][0].id));

await inBatches(
  updates.map(({ row }) =>
    db
      .update(buses)
      .set({ ...columns(row), updated_at: sql`datetime('now')` })
      .where(eq(buses.id, row.id!)),
  ),
);

await inBatches([...positions].map(([row, vp]) => upsertLastSeen(db, row.id!, vp)));

console.log(`\nSaved: ${inserts.length} new, ${updates.length} updated, ${positions.size} positions.`);
db.$client.close();
