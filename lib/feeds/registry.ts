import type { Country, VehiclePosition } from "../types";

/** A VehiclePosition field that can identify a vehicle. */
export type IdentityField = "vehicleId" | "label" | "plate";

/** A GTFS-Realtime VehiclePositions feed the site can read. */
export interface FeedConfig {
  /** Stable id stored on buses.feed_id. */
  id: string;
  /** Human name of the feed or operator. */
  name: string;
  /** Country the feed covers. */
  country: Country;
  /** Environment variable holding the API key, or null for keyless feeds. */
  keyEnv: string | null;
  /**
   * Fields that stay the same for a vehicle across feed updates, tried in order.
   * Defaults to vehicle id, then label, then plate. Some feeds put trip or session data in the vehicle id.
   */
  identity?: IdentityField[];
  /** Whether the fleet number can be guessed from the last five digits of a Samtrafiken vehicle id. */
  guessFleet?: boolean;
  /** Vehicle id groups (digits 8–11) whose last digits are not fleet numbers, so no guess is made. */
  noGuessGroups?: string[];
  /**
   * Tidies or drops a position before it is used, for feeds that mix in other vehicles or put data in the wrong field.
   * Returns null to drop the position.
   */
  adjust?: (vp: VehiclePosition) => VehiclePosition | null;
  /**
   * Builds the request URL and headers from the API key.
   * When a vehicle id is given, a feed that can filter by vehicle asks for just that vehicle; others ignore it.
   */
  request: (key: string, vehicleId?: string) => { url: string; headers?: Record<string, string> };
}

/**
 * Builds a Trafiklab GTFS Sweden 3 realtime feed for one operator.
 * @param operator Operator slug used in the Samtrafiken URL, e.g. "sl".
 * @param name Display name.
 * @param noGuessGroups Vehicle id groups to skip when guessing fleet numbers.
 * @returns The feed config.
 */
function sweden(operator: string, name: string, noGuessGroups: string[] = []): FeedConfig {
  return {
    id: `se-${operator}`,
    name,
    country: "SE",
    keyEnv: "TRAFIKLAB_KEY",
    guessFleet: true,
    noGuessGroups,
    request: (key) => ({
      url: `https://opendata.samtrafiken.se/gtfs-rt-sweden/${operator}/VehiclePositionsSweden.pb?key=${encodeURIComponent(key)}`,
    }),
  };
}

/**
 * Builds an adjust function for feeds that put the number plate in the label, moving plate-shaped labels to the plate.
 * @param plate Pattern a label must match to count as a plate.
 * @returns The adjust function.
 */
function labelAsPlate(plate: RegExp): (vp: VehiclePosition) => VehiclePosition {
  return (vp) => (vp.label && plate.test(vp.label) ? { ...vp, plate: vp.plate ?? vp.label, label: null } : vp);
}

/**
 * Builds an adjust function for feeds whose vehicle id is the number plate, copying plate-shaped ids into the plate.
 * @param plate Pattern a vehicle id must match to count as a plate.
 * @returns The adjust function.
 */
function idAsPlate(plate: RegExp): (vp: VehiclePosition) => VehiclePosition {
  return (vp) => (!vp.plate && vp.vehicleId && plate.test(vp.vehicleId) ? { ...vp, plate: vp.vehicleId } : vp);
}

/** Every realtime feed the site knows about. Feeds whose key is missing are skipped. */
export const FEEDS: FeedConfig[] = [
  sweden("sl", "SL (Stockholm)", ["0025", "0027"]),
  sweden("ul", "UL (Uppsala)"),
  sweden("otraf", "Östgötatrafiken"),
  sweden("skane", "Skånetrafiken"),
  sweden("klt", "Kalmar länstrafik"),
  sweden("varm", "Värmlandstrafik"),
  sweden("xt", "X-trafik"),
  sweden("dt", "Dalatrafik"),
  sweden("orebro", "Länstrafiken Örebro"),
  sweden("jlt", "Jönköpings länstrafik"),
  {
    id: "gb-bods",
    name: "Bus Open Data Service (England)",
    country: "GB",
    keyEnv: "BODS_KEY",
    adjust: labelAsPlate(/^[A-Z]{2}\d{2}[ _]?[A-Z]{3}$/),
    request: (key, vehicleId) => {
      const colon = vehicleId?.indexOf(":") ?? -1;
      const filter =
        vehicleId && colon > 0
          ? `operatorRef=${encodeURIComponent(vehicleId.slice(0, colon))}&vehicleRef=${encodeURIComponent(vehicleId.slice(colon + 1))}`
          : "boundingBox=-8.7,49.8,1.8,60.9";
      return { url: `https://data.bus-data.dft.gov.uk/api/v1/datafeed/?${filter}&api_key=${encodeURIComponent(key)}` };
    },
  },
  {
    id: "au-tfnsw",
    name: "Transport for NSW buses",
    country: "AU",
    keyEnv: "TFNSW_KEY",
    identity: ["plate", "label", "vehicleId"],
    request: (key) => ({
      url: "https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses",
      headers: { Authorization: `apikey ${key}` },
    }),
  },
  {
    id: "au-translink",
    name: "Translink (South East Queensland)",
    country: "AU",
    keyEnv: null,
    request: () => ({ url: "https://gtfsrt.api.translink.com.au/api/realtime/SEQ/VehiclePositions/Bus" }),
  },
  {
    id: "au-ptv",
    name: "PTV bus (Victoria)",
    country: "AU",
    keyEnv: "PTV_KEY",
    adjust: idAsPlate(/^(?:[A-Z]{2}\d{2}[A-Z]{2}|\d{4}[A-Z]{2})$/),
    request: (key) => ({
      url: "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions",
      headers: { KeyId: key },
    }),
  },
  {
    id: "nz-at",
    name: "Auckland Transport",
    country: "NZ",
    keyEnv: "AT_KEY",
    adjust: (vp) => (/^\d{5}$/.test(vp.vehicleId ?? "") && !vp.label?.startsWith("AMP") ? vp : null),
    request: (key) => ({
      url: "https://api.at.govt.nz/realtime/legacy/vehiclelocations",
      headers: { "Ocp-Apim-Subscription-Key": key, Accept: "application/json" },
    }),
  },
  {
    id: "nz-metlink",
    name: "Metlink (Wellington)",
    country: "NZ",
    keyEnv: "METLINK_KEY",
    adjust: (vp) => (/^\d{9}$/.test(vp.vehicleId ?? "") ? null : vp),
    request: (key) => ({
      url: "https://api.opendata.metlink.org.nz/v1/gtfs-rt/vehiclepositions",
      headers: { "x-api-key": key, Accept: "application/json" },
    }),
  },
  {
    id: "nz-metro-chc",
    name: "Metro (Christchurch)",
    country: "NZ",
    keyEnv: "METRO_CHC_KEY",
    adjust: labelAsPlate(/^[A-Z]{1,3}\d{1,4}$/),
    request: (key) => ({
      url: "https://apis.metroinfo.co.nz/rti/gtfsrt/v1/vehicle-positions.pb",
      headers: { "Ocp-Apim-Subscription-Key": key },
    }),
  },
];

/**
 * Looks up a feed by id.
 * @param id Feed id as stored on a bus.
 * @returns The feed config, or undefined for unknown ids.
 */
export function feedById(id: string | null | undefined): FeedConfig | undefined {
  return FEEDS.find((feed) => feed.id === id);
}

/**
 * Lists the feeds that can be called right now: keyless ones plus those whose key is set.
 * @returns Usable feeds.
 */
export function enabledFeeds(): FeedConfig[] {
  return FEEDS.filter((feed) => feed.keyEnv === null || Boolean(process.env[feed.keyEnv]));
}

/**
 * Picks the identifier that stays the same for a vehicle in a given feed.
 * @param feed The feed the position came from, if known.
 * @param vp The vehicle position.
 * @returns The stable identifier, or null when the vehicle has none.
 */
export function vehicleKey(feed: FeedConfig | undefined, vp: VehiclePosition): string | null {
  for (const field of feed?.identity ?? ["vehicleId", "label", "plate"]) {
    if (vp[field]) return vp[field];
  }
  return null;
}

/**
 * Works out a bus's fleet number from a feed position: the label when the feed has one,
 * otherwise a guess from the vehicle id for feeds where that is known to work.
 * @param feed The feed the position came from, if known.
 * @param vp The vehicle position.
 * @returns The fleet number and whether it is a guess, or null when there is nothing to go on.
 */
export function fleetNumber(feed: FeedConfig | undefined, vp: VehiclePosition): { value: string; guessed: boolean } | null {
  if (vp.label) return { value: vp.label, guessed: false };
  return guessFleetFromId(feed, vp.vehicleId);
}

/**
 * Guesses a fleet number from a Samtrafiken vehicle id (9031 + region + 9 digits), using its last five digits.
 * Trafiklab doesn't document this, so the result is only a guess.
 * @param feed The feed the id came from, if known.
 * @param vehicleId The feed's vehicle id.
 * @returns The guess without leading zeros, or null when the feed or id doesn't fit the pattern.
 */
export function guessFleetFromId(feed: FeedConfig | undefined, vehicleId: string | null): { value: string; guessed: true } | null {
  if (!feed?.guessFleet || !vehicleId || !/^9031\d{12}$/.test(vehicleId)) return null;
  if (feed.noGuessGroups?.includes(vehicleId.slice(7, 11))) return null;
  const value = String(Number(vehicleId.slice(-5)));
  return value === "0" ? null : { value, guessed: true };
}
