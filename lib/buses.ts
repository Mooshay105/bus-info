import "server-only";
import { query, queryOne, readyDb } from "./db";
import { normalizeKey } from "./normalize";
import { EDITABLE_FIELDS, type Bus, type BusChanges, type Country, type EditableField, type LastSeen, type VehiclePosition } from "./types";
import type { DvlaVehicle } from "./plates/dvla";
import { feedById, fleetNumber, vehicleKey } from "./feeds/registry";

/** Columns selected for every Bus query, joined with the operator name. */
const BUS_SELECT = `
  SELECT b.id, b.country, b.plate, b.fleet_number, b.fleet_guessed, b.gtfs_vehicle_id, b.feed_id, b.operator_id,
         o.name AS operator_name, b.make, b.model, b.body, b.year_built, b.first_registered,
         b.fuel, b.colour, b.status, b.source
  FROM buses b LEFT JOIN operators o ON o.id = b.operator_id`;

/**
 * Loads one bus by id.
 * @param id Internal bus id.
 * @returns The bus, or undefined when it does not exist.
 */
export function getBus(id: number): Promise<Bus | undefined> {
  return queryOne<Bus>({ sql: `${BUS_SELECT} WHERE b.id = ?`, args: [id] });
}

/**
 * Finds buses whose plate, fleet number or feed vehicle id matches a normalised key.
 * @param key Output of normalizeKey.
 * @returns Matching buses, plates first.
 */
export function findBuses(key: string): Promise<Bus[]> {
  return query<Bus>({
    sql: `${BUS_SELECT} WHERE b.plate_norm = ?1 OR b.fleet_norm = ?1 OR b.gtfs_norm = ?1
          ORDER BY (b.plate_norm = ?1) DESC, b.id LIMIT 50`,
    args: [key],
  });
}

/**
 * Loads several buses by id.
 * @param ids Internal bus ids.
 * @returns The buses that exist, ordered by id.
 */
export function getBuses(ids: number[]): Promise<Bus[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return query<Bus>({ sql: `${BUS_SELECT} WHERE b.id IN (${ids.map(() => "?").join(", ")}) ORDER BY b.id`, args: ids });
}

/**
 * Returns the operator id for a name and country, creating the operator when it is new.
 * @param name Operator name.
 * @param country Country code.
 * @param feedId Realtime feed the operator uses, if any.
 * @returns The operator id.
 */
export async function operatorId(name: string, country: Country, feedId: string | null = null): Promise<number> {
  const result = await (await readyDb()).execute({
    sql: `INSERT INTO operators (name, country, feed_id) VALUES (?, ?, ?)
          ON CONFLICT (name, country) DO UPDATE SET feed_id = COALESCE(operators.feed_id, excluded.feed_id)
          RETURNING id`,
    args: [name.trim(), country, feedId],
  });
  return Number(result.rows[0].id);
}

/**
 * Saves a bus found through the DVLA, or returns the existing one with the same plate.
 * @param v DVLA response.
 * @returns The bus id.
 */
export async function saveDvlaBus(v: DvlaVehicle): Promise<number> {
  const key = normalizeKey(v.registrationNumber);
  const existing = await queryOne<{ id: number }>({
    sql: "SELECT id FROM buses WHERE country = 'GB' AND plate_norm = ?",
    args: [key],
  });
  if (existing) return Number(existing.id);
  const result = await (await readyDb()).execute({
    sql: `INSERT INTO buses (country, plate, plate_norm, make, year_built, first_registered, fuel, colour, source)
          VALUES ('GB', ?, ?, ?, ?, ?, ?, ?, 'dvla') RETURNING id`,
    args: [
      v.registrationNumber,
      key,
      v.make ?? null,
      v.yearOfManufacture ?? null,
      v.monthOfFirstRegistration ?? null,
      v.fuelType ?? null,
      v.colour ?? null,
    ],
  });
  return Number(result.rows[0].id);
}

/**
 * Saves a bus first seen in a realtime feed, or returns the existing one for that feed and vehicle id.
 * @param vp The vehicle position that identified the bus.
 * @returns The bus id, or null when the feed gives the vehicle no identifier that stays the same.
 */
export async function saveFeedBus(vp: VehiclePosition): Promise<number | null> {
  const feed = feedById(vp.feedId);
  const vehicleId = vehicleKey(feed, vp);
  if (!vehicleId) return null;
  const fleet = fleetNumber(feed, vp);
  const opId = feed ? await operatorId(feed.name, feed.country, feed.id) : null;
  const result = await (await readyDb()).execute({
    sql: `INSERT INTO buses (country, plate, plate_norm, fleet_number, fleet_norm, fleet_guessed, gtfs_vehicle_id, gtfs_norm, feed_id, operator_id, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'feed')
          ON CONFLICT (feed_id, gtfs_vehicle_id) DO UPDATE SET updated_at = datetime('now')
          RETURNING id`,
    args: [
      feed?.country ?? "GB",
      vp.plate,
      vp.plate ? normalizeKey(vp.plate) : null,
      fleet?.value ?? null,
      fleet ? normalizeKey(fleet.value) : null,
      fleet?.guessed ? 1 : 0,
      vehicleId,
      normalizeKey(vehicleId),
      vp.feedId,
      opId,
    ],
  });
  const id = Number(result.rows[0].id);
  await saveLastSeen(id, vp);
  return id;
}

/**
 * Stores the newest known position of a bus, keeping the stored one when it is newer.
 * @param busId Bus id.
 * @param vp Position read from a feed.
 */
export async function saveLastSeen(busId: number, vp: VehiclePosition): Promise<void> {
  await (await readyDb()).execute({
    sql: `INSERT INTO last_seen (bus_id, lat, lon, bearing, speed, route_id, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (bus_id) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, bearing = excluded.bearing,
            speed = excluded.speed, route_id = excluded.route_id, seen_at = excluded.seen_at
          WHERE excluded.seen_at >= last_seen.seen_at`,
    args: [busId, vp.lat, vp.lon, vp.bearing, vp.speed, vp.routeId, vp.timestamp ?? Math.floor(Date.now() / 1000)],
  });
}

/**
 * Loads the last known position of a bus.
 * @param busId Bus id.
 * @returns The stored position, or undefined if the bus has never been seen.
 */
export function getLastSeen(busId: number): Promise<LastSeen | undefined> {
  return queryOne<LastSeen>({
    sql: "SELECT lat, lon, bearing, speed, route_id, seen_at FROM last_seen WHERE bus_id = ?",
    args: [busId],
  });
}

/**
 * Applies approved changes to a bus, or creates the bus when busId is null.
 * @param busId Bus to update, or null for a new bus.
 * @param changes Field values to set; empty strings clear a field.
 * @returns The id of the updated or created bus.
 */
export async function applyChanges(busId: number | null, changes: BusChanges): Promise<number> {
  const { operator_name, ...fields } = changes;
  const values: Record<string, string | number | null> = {};
  for (const [field, raw] of Object.entries(fields)) {
    if (!EDITABLE_FIELDS.includes(field as EditableField)) continue;
    const value = raw?.trim() ?? "";
    values[field] = value === "" ? null : field === "year_built" ? Number(value) : value;
  }
  if ("plate" in values) values.plate_norm = values.plate ? normalizeKey(String(values.plate)) : null;
  if ("fleet_number" in values) {
    values.fleet_norm = values.fleet_number ? normalizeKey(String(values.fleet_number)) : null;
    values.fleet_guessed = 0;
  }
  if ("gtfs_vehicle_id" in values) values.gtfs_norm = values.gtfs_vehicle_id ? normalizeKey(String(values.gtfs_vehicle_id)) : null;

  if (operator_name !== undefined) {
    if (operator_name.trim()) {
      const bus = busId === null ? undefined : await getBus(busId);
      const country = (values.country ?? bus?.country ?? "SE") as Country;
      values.operator_id = await operatorId(operator_name, country, (values.feed_id as string | null) ?? bus?.feed_id ?? null);
    } else {
      values.operator_id = null;
    }
  }
  if (busId === null) {
    const row = { ...values, country: values.country ?? "SE", source: "curated" };
    const names = Object.keys(row) as (keyof typeof row)[];
    const result = await (await readyDb()).execute({
      sql: `INSERT INTO buses (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")}) RETURNING id`,
      args: names.map((n) => row[n]),
    });
    return Number(result.rows[0].id);
  }
  const columns = Object.keys(values);
  if (columns.length > 0) {
    await (await readyDb()).execute({
      sql: `UPDATE buses SET ${columns.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      args: [...columns.map((c) => values[c]), busId],
    });
  }
  return busId;
}
