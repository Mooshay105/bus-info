import "server-only";
import { findBuses, saveDvlaBus, saveFeedBus } from "./buses";
import { searchFeeds } from "./feeds/vehicles";
import { normalizeKey, plateCountries } from "./normalize";
import { lookupDvla } from "./plates/dvla";
import type { Bus } from "./types";

/**
 * Resolves what a user typed to buses: saved data first, then the DVLA for UK plates, then the live feeds.
 * Buses found through the DVLA or a feed are saved so later searches hit the database.
 * @param input Plate, fleet number or feed vehicle id as typed.
 * @returns Matching buses; empty when nothing matched anywhere.
 */
export async function searchBuses(input: string): Promise<Bus[]> {
  const key = normalizeKey(input);
  if (key.length < 2) return [];

  const saved = await findBuses(key);
  if (saved.length > 0) return saved;

  if (plateCountries(key).includes("GB")) {
    const dvla = await lookupDvla(key);
    if (dvla) {
      await saveDvlaBus(dvla);
      return findBuses(key);
    }
  }

  const live = await searchFeeds(key);
  if (live.length > 0) {
    await Promise.all(live.map((vp) => saveFeedBus(vp)));
    return findBuses(key);
  }
  return [];
}
