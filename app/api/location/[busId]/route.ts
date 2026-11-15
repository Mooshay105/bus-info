import { getBus, getLastSeen, saveLastSeen } from "@/lib/buses";
import { feedById, vehicleKey } from "@/lib/feeds/registry";
import { findVehiclesInFeed } from "@/lib/feeds/vehicles";
import { normalizeKey } from "@/lib/normalize";

export async function GET(_req: Request, ctx: RouteContext<"/api/location/[busId]">) {
  const id = Number((await ctx.params).busId);
  const bus = Number.isInteger(id) ? await getBus(id) : undefined;
  if (!bus) return Response.json({ error: "Bus not found" }, { status: 404 });

  if (bus.feed_id) {
    const feed = feedById(bus.feed_id);
    const ids = bus.gtfs_vehicle_id ? [bus.gtfs_vehicle_id] : [bus.fleet_number, bus.plate];
    const keys = [...new Set(ids.filter((v): v is string => Boolean(v)).map(normalizeKey))].sort();
    const found = await findVehiclesInFeed(bus.feed_id, keys);
    const own = bus.gtfs_vehicle_id
      ? found.filter((vp) => normalizeKey(vehicleKey(feed, vp)) === keys[0])
      : found;
    if (own.length === 1) await saveLastSeen(bus.id, own[0]);
  }
  return Response.json({ lastSeen: (await getLastSeen(bus.id)) ?? null }, { headers: { "Cache-Control": "no-store" } });
}
