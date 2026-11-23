import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { buses, lastSeen } from "@/db/schema";
import { selectBuses, upsertLastSeen, upsertOperator } from "@/db/queries";
import { getDb } from "./db";
import { normalizeKey } from "./normalize";
import { EDITABLE_FIELDS, type Bus, type BusChanges, type Country, type EditableField, type LastSeen, type VehiclePosition } from "./types";
import type { DvlaVehicle } from "./plates/dvla";
import { feedById, fleetNumber, vehicleKey } from "./feeds/registry";

/**
 * Loads one bus by id.
 * @param id Internal bus id.
 * @returns The bus, or undefined when it does not exist.
 */
export async function getBus(id: number): Promise<Bus | undefined> {
  return selectBuses(await getDb()).where(eq(buses.id, id)).get();
}

/**
 * Finds buses whose plate, fleet number or feed vehicle id matches a normalised key.
 * @param key Output of normalizeKey.
 * @returns Matching buses, plates first.
 */
export async function findBuses(key: string): Promise<Bus[]> {
  return selectBuses(await getDb())
    .where(or(eq(buses.plate_norm, key), eq(buses.fleet_norm, key), eq(buses.gtfs_norm, key)))
    .orderBy(desc(sql`${buses.plate_norm} = ${key}`), buses.id)
    .limit(50);
}

/**
 * Loads several buses by id.
 * @param ids Internal bus ids.
 * @returns The buses that exist, ordered by id.
 */
export async function getBuses(ids: number[]): Promise<Bus[]> {
  if (ids.length === 0) return [];
  return selectBuses(await getDb()).where(inArray(buses.id, ids)).orderBy(buses.id);
}

/**
 * Returns the operator id for a name and country, creating the operator when it is new.
 * @param name Operator name.
 * @param country Country code.
 * @param feedId Realtime feed the operator uses, if any.
 * @returns The operator id.
 */
export async function operatorId(name: string, country: Country, feedId: string | null = null): Promise<number> {
  const row = await upsertOperator(await getDb(), name, country, feedId).get();
  return row!.id;
}

/**
 * Saves a bus found through the DVLA, or returns the existing one with the same plate.
 * @param v DVLA response.
 * @returns The bus id.
 */
export async function saveDvlaBus(v: DvlaVehicle): Promise<number> {
  const db = await getDb();
  const key = normalizeKey(v.registrationNumber);
  const existing = await db
    .select({ id: buses.id })
    .from(buses)
    .where(and(eq(buses.country, "GB"), eq(buses.plate_norm, key)))
    .get();
  if (existing) return existing.id;
  const row = await db
    .insert(buses)
    .values({
      country: "GB",
      plate: v.registrationNumber,
      plate_norm: key,
      make: v.make ?? null,
      year_built: v.yearOfManufacture ?? null,
      first_registered: v.monthOfFirstRegistration ?? null,
      fuel: v.fuelType ?? null,
      colour: v.colour ?? null,
      source: "dvla",
    })
    .returning({ id: buses.id })
    .get();
  return row.id;
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
  const row = await (await getDb())
    .insert(buses)
    .values({
      country: feed?.country ?? "GB",
      plate: vp.plate,
      plate_norm: vp.plate ? normalizeKey(vp.plate) : null,
      fleet_number: fleet?.value ?? null,
      fleet_norm: fleet ? normalizeKey(fleet.value) : null,
      fleet_guessed: fleet?.guessed ? 1 : 0,
      gtfs_vehicle_id: vehicleId,
      gtfs_norm: normalizeKey(vehicleId),
      feed_id: vp.feedId,
      operator_id: opId,
      source: "feed",
    })
    .onConflictDoUpdate({ target: [buses.feed_id, buses.gtfs_vehicle_id], set: { updated_at: sql`datetime('now')` } })
    .returning({ id: buses.id })
    .get();
  await saveLastSeen(row.id, vp);
  return row.id;
}

/**
 * Stores the newest known position of a bus, keeping the stored one when it is newer.
 * @param busId Bus id.
 * @param vp Position read from a feed.
 */
export async function saveLastSeen(busId: number, vp: VehiclePosition): Promise<void> {
  await upsertLastSeen(await getDb(), busId, vp);
}

/**
 * Loads the last known position of a bus.
 * @param busId Bus id.
 * @returns The stored position, or undefined if the bus has never been seen.
 */
export async function getLastSeen(busId: number): Promise<LastSeen | undefined> {
  return (await getDb())
    .select({
      lat: lastSeen.lat,
      lon: lastSeen.lon,
      bearing: lastSeen.bearing,
      speed: lastSeen.speed,
      route_id: lastSeen.route_id,
      seen_at: lastSeen.seen_at,
    })
    .from(lastSeen)
    .where(eq(lastSeen.bus_id, busId))
    .get();
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
  const db = await getDb();
  const columns = values as Partial<typeof buses.$inferInsert>;
  if (busId === null) {
    const row = await db
      .insert(buses)
      .values({ ...columns, country: columns.country ?? "SE", source: "curated" })
      .returning({ id: buses.id })
      .get();
    return row.id;
  }
  if (Object.keys(columns).length > 0) {
    await db
      .update(buses)
      .set({ ...columns, updated_at: sql`datetime('now')` })
      .where(eq(buses.id, busId));
  }
  return busId;
}
