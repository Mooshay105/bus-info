import type { VehiclePosition } from "../types";
import { decodeVehiclePositions, vehiclePositionsFromJson } from "./protobuf";
import type { FeedConfig } from "./registry";
import { vehiclePositionsFromSiri } from "./siri";

/** Result of downloading one feed: its positions, or why it was skipped. */
export type FeedDownload = { ok: true; positions: VehiclePosition[] } | { ok: false; reason: string };

/**
 * Downloads a feed and decodes every vehicle position in it, reporting why when it can't.
 * @param feed The feed to read.
 * @param timeoutMs How long to wait for the response.
 * @param vehicleId Feed vehicle id to ask for on its own, for feeds that can filter by vehicle.
 * @returns The positions, or a reason such as a missing key or an HTTP error.
 */
export async function downloadFeed(feed: FeedConfig, timeoutMs = 10_000, vehicleId?: string): Promise<FeedDownload> {
  const key = feed.keyEnv ? process.env[feed.keyEnv] : "";
  if (feed.keyEnv && !key) return { ok: false, reason: `${feed.keyEnv} is not set` };
  const { url, headers } = feed.request(key ?? "", vehicleId);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "buss-info/0.1", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    const positions = type.includes("json")
      ? vehiclePositionsFromJson(await res.json(), feed.id)
      : type.includes("xml")
        ? vehiclePositionsFromSiri(await res.text(), feed.id)
        : decodeVehiclePositions(new Uint8Array(await res.arrayBuffer()), feed.id);
    const { adjust } = feed;
    return { ok: true, positions: adjust ? positions.flatMap((vp) => adjust(vp) ?? []) : positions };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
