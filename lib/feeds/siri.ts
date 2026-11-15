import type { VehiclePosition } from "../types";

/** XML entities that can appear in SIRI text values, and the characters they stand for. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * Reads the text of the first element with a given name.
 * @param xml XML to search.
 * @param name Element name without a namespace prefix.
 * @returns The trimmed text with entities decoded, or null when the element is missing or empty.
 */
function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  const value = match?.[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]).trim();
  return value ? value : null;
}

/**
 * Reads vehicle positions from a SIRI-VM VehicleMonitoringDelivery, as the Bus Open Data Service serves it.
 * Vehicle refs are only unique within an operator, so the vehicle id is the operator ref and vehicle ref joined by a colon,
 * and the vehicle ref itself becomes the label.
 * @param xml The whole SIRI-VM response.
 * @param feedId Id of the feed, copied onto each result.
 * @returns Vehicle positions that have a vehicle ref, a latitude and a longitude.
 */
export function vehiclePositionsFromSiri(xml: string, feedId: string): VehiclePosition[] {
  const out: VehiclePosition[] = [];
  for (const activity of xml.split("<VehicleActivity>").slice(1)) {
    const vehicleRef = tag(activity, "VehicleRef");
    const lat = Number(tag(activity, "Latitude") ?? NaN);
    const lon = Number(tag(activity, "Longitude") ?? NaN);
    if (!vehicleRef || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const operatorRef = tag(activity, "OperatorRef");
    const bearing = Number(tag(activity, "Bearing") ?? NaN);
    const recorded = Date.parse(tag(activity, "RecordedAtTime") ?? "");
    out.push({
      feedId,
      vehicleId: operatorRef ? `${operatorRef}:${vehicleRef}` : vehicleRef,
      label: vehicleRef,
      plate: null,
      lat,
      lon,
      bearing: Number.isFinite(bearing) ? bearing : null,
      speed: null,
      routeId: tag(activity, "PublishedLineName") ?? tag(activity, "LineRef"),
      timestamp: Number.isFinite(recorded) ? Math.floor(recorded / 1000) : null,
    });
  }
  return out;
}
