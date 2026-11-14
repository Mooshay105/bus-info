import type { VehiclePosition } from "../types";
import { decodeVehiclePositions, vehiclePositionsFromJson } from "./protobuf";
import type { FeedConfig } from "./registry";

/** Result of downloading one feed: its positions, or why it was skipped. */
export type FeedDownload = { ok: true; positions: VehiclePosition[] } | { ok: false; reason: string };

/**
 * Downloads a feed and decodes every vehicle position in it, reporting why when it can't.
 * @param feed The feed to read.
 * @param timeoutMs How long to wait for the response.
 * @returns The positions, or a reason such as a missing key or an HTTP error.
 */
export async function downloadFeed(feed: FeedConfig, timeoutMs = 10_000): Promise<FeedDownload> {
  const key = feed.keyEnv ? process.env[feed.keyEnv] : "";
  if (feed.keyEnv && !key) return { ok: false, reason: `${feed.keyEnv} is not set` };
  const { url, headers } = feed.request(key ?? "");
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "buss-info/0.1", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const positions = (res.headers.get("content-type") ?? "").includes("json")
      ? vehiclePositionsFromJson(await res.json(), feed.id)
      : decodeVehiclePositions(new Uint8Array(await res.arrayBuffer()), feed.id);
    return { ok: true, positions };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
