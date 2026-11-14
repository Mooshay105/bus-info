import "server-only";
import { cacheLife } from "next/cache";
import { normalizeKey } from "../normalize";
import type { VehiclePosition } from "../types";
import { downloadFeed } from "./download";
import { enabledFeeds, feedById, type FeedConfig } from "./registry";

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

/**
 * Finds one vehicle in a feed, cached for about 20 seconds per feed and key set.
 * @param feedId Feed to search.
 * @param keys Normalised identifiers (vehicle id, fleet number, plate) to match.
 * @returns The newest matching position, or null.
 */
export async function findVehicleInFeed(feedId: string, keys: string[]): Promise<VehiclePosition | null> {
  "use cache";
  cacheLife({ stale: 20, revalidate: 20, expire: 60 });
  const feed = feedById(feedId);
  if (!feed || keys.length === 0) return null;
  const hits = (await fetchFeed(feed)).filter((vp) => matches(vp, keys));
  hits.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return hits[0] ?? null;
}

/**
 * Searches every enabled feed for a vehicle matching one identifier.
 * @param key Normalised identifier typed by the user.
 * @returns All matching positions across feeds.
 */
export async function searchFeeds(key: string): Promise<VehiclePosition[]> {
  const results = await Promise.all(enabledFeeds().map((feed) => findVehicleInFeed(feed.id, [key])));
  return results.filter((vp): vp is VehiclePosition => vp !== null);
}
