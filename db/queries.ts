import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { buses, lastSeen, operators } from "./schema";
import type { Country, VehiclePosition } from "../lib/types";

/** Columns selected for every Bus query. Use with selectBuses so operator_name is joined. */
export const busColumns = {
  id: buses.id,
  country: buses.country,
  plate: buses.plate,
  fleet_number: buses.fleet_number,
  fleet_guessed: buses.fleet_guessed,
  gtfs_vehicle_id: buses.gtfs_vehicle_id,
  feed_id: buses.feed_id,
  operator_id: buses.operator_id,
  operator_name: operators.name,
  make: buses.make,
  model: buses.model,
  body: buses.body,
  year_built: buses.year_built,
  first_registered: buses.first_registered,
  fuel: buses.fuel,
  colour: buses.colour,
  status: buses.status,
  source: buses.source,
};

/**
 * Starts a query for buses joined with their operator name, selecting busColumns.
 * @param db Database to query.
 * @returns A select query to add where, orderBy and limit to.
 */
export function selectBuses(db: Db) {
  return db.select(busColumns).from(buses).leftJoin(operators, eq(operators.id, buses.operator_id));
}

/**
 * Builds a query that creates an operator, or keeps the existing one with the same name and country and fills in its feed if it had none.
 * @param db Database to write to.
 * @param name Operator name.
 * @param country Country code.
 * @param feedId Realtime feed the operator uses, if any.
 * @returns An insert query that returns the operator id.
 */
export function upsertOperator(db: Db, name: string, country: Country, feedId: string | null) {
  return db
    .insert(operators)
    .values({ name: name.trim(), country, feed_id: feedId })
    .onConflictDoUpdate({
      target: [operators.name, operators.country],
      set: { feed_id: sql`coalesce(${operators.feed_id}, excluded.feed_id)` },
    })
    .returning({ id: operators.id });
}

/**
 * Builds a query that stores a bus position, keeping the stored one when it is newer.
 * @param db Database to write to.
 * @param busId Bus id.
 * @param vp Position read from a feed.
 * @returns An insert query.
 */
export function upsertLastSeen(db: Db, busId: number, vp: VehiclePosition) {
  return db
    .insert(lastSeen)
    .values({
      bus_id: busId,
      lat: vp.lat,
      lon: vp.lon,
      bearing: vp.bearing,
      speed: vp.speed,
      route_id: vp.routeId,
      seen_at: vp.timestamp ?? Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: lastSeen.bus_id,
      set: {
        lat: sql`excluded.lat`,
        lon: sql`excluded.lon`,
        bearing: sql`excluded.bearing`,
        speed: sql`excluded.speed`,
        route_id: sql`excluded.route_id`,
        seen_at: sql`excluded.seen_at`,
      },
      setWhere: sql`excluded.seen_at >= ${lastSeen.seen_at}`,
    });
}
