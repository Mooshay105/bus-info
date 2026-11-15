import "server-only";
import { cacheLife } from "next/cache";
import { normalizeKey } from "../normalize";
import type { VehiclePosition } from "../types";
import { downloadFeed } from "./download";
import { enabledFeeds, feedById, vehicleKey, type FeedConfig } from "./registry";

/**
 * Downloads a feed and decodes every vehicle position in it.
 * @param feed The feed to read.
 * @returns All vehicle positions, or an empty list if the feed has no key or fails.
 */
export async function fetchFeed(feed: FeedConfig): Promise<VehiclePosition[]> {
  const result = await downloadFeed(feed);
  return result.ok ? result.positions : [];
}

/**
 * Checks whether a vehicle position matches any of the given keys by id, label or plate.
 * @param vp The vehicle position.
 * @param keys Normalised keys to look for.
 * @returns True when one of the vehicle's identifiers matches.
 */
function matches(vp: VehiclePosition, keys: string[]): boolean {
  return [vp.vehicleId, vp.label, vp.plate].some((value) => value != null && keys.includes(normalizeKey(value)));
}

/** Most live matches one search returns, the same cap as a database search. */
const MAX_LIVE_RESULTS = 50;

/**
 * Finds every vehicle in a feed that matches, cached for about 20 seconds per feed and key set.
 * Fleet numbers repeat between operators in one feed, so a key can match several buses.
 * @param feedId Feed to search.
 * @param keys Normalised identifiers (vehicle id, fleet number, plate) to match.
 * @returns The newest position of each matching vehicle, newest first.
 */
export async function findVehiclesInFeed(feedId: string, keys: string[]): Promise<VehiclePosition[]> {
  "use cache";
  cacheLife({ stale: 20, revalidate: 20, expire: 60 });
  const feed = feedById(feedId);
  if (!feed || keys.length === 0) return [];
  const newest = new Map<string, VehiclePosition>();
  for (const vp of await fetchFeed(feed)) {
    if (!matches(vp, keys)) continue;
    const id = vehicleKey(feed, vp) ?? "";
    const seen = newest.get(id);
    if (!seen || (vp.timestamp ?? 0) > (seen.timestamp ?? 0)) newest.set(id, vp);
  }
  return [...newest.values()].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

/**
 * Searches every enabled feed for vehicles matching one identifier.
 * @param key Normalised identifier typed by the user.
 * @returns Every matching vehicle across feeds, at most MAX_LIVE_RESULTS.
 */
export async function searchFeeds(key: string): Promise<VehiclePosition[]> {
  const results = await Promise.all(enabledFeeds().map((feed) => findVehiclesInFeed(feed.id, [key])));
  return results.flat().slice(0, MAX_LIVE_RESULTS);
}
