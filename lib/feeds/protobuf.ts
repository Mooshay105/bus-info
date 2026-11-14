import type { VehiclePosition } from "../types";

/** Protobuf wire types used by GTFS-Realtime. */
enum Wire {
  Varint = 0,
  Fixed64 = 1,
  Bytes = 2,
  Fixed32 = 5,
}

/** A field read from a protobuf message: its number, wire type and raw value. */
interface Field {
  /** Field number from the .proto definition. */
  num: number;
  /** Wire type of the encoded value. */
  wire: Wire;
  /** Varint value, for Wire.Varint. */
  int: number;
  /** Byte slice, for Wire.Bytes, Wire.Fixed32 and Wire.Fixed64. */
  bytes: Uint8Array;
}

const decoder = new TextDecoder();

/**
 * Iterates over the top-level fields of one protobuf message.
 * @param buf The encoded message.
 * @returns A generator of fields in wire order.
 */
function* fields(buf: Uint8Array): Generator<Field> {
  let pos = 0;
  const varint = () => {
    let result = 0;
    let scale = 1;
    for (;;) {
      if (pos >= buf.length) throw new Error("Truncated varint");
      const byte = buf[pos++];
      result += (byte & 0x7f) * scale;
      if (byte < 0x80) return result;
      scale *= 128;
    }
  };
  while (pos < buf.length) {
    const tag = varint();
    const num = Math.floor(tag / 8);
    const wire = (tag & 7) as Wire;
    const empty = buf.subarray(0, 0);
    if (wire === Wire.Varint) {
      yield { num, wire, int: varint(), bytes: empty };
    } else if (wire === Wire.Bytes) {
      const len = varint();
      yield { num, wire, int: 0, bytes: buf.subarray(pos, pos + len) };
      pos += len;
    } else if (wire === Wire.Fixed32) {
      yield { num, wire, int: 0, bytes: buf.subarray(pos, pos + 4) };
      pos += 4;
    } else if (wire === Wire.Fixed64) {
      yield { num, wire, int: 0, bytes: buf.subarray(pos, pos + 8) };
      pos += 8;
    } else {
      throw new Error(`Unsupported wire type ${wire}`);
    }
  }
}

/**
 * Reads a little-endian 32-bit float from a fixed32 field.
 * @param bytes Four bytes from the field.
 * @returns The float value.
 */
function float32(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
}

/**
 * Reads a string field.
 * @param bytes UTF-8 bytes from the field.
 * @returns The decoded string, or null when empty.
 */
function text(bytes: Uint8Array): string | null {
  const value = decoder.decode(bytes);
  return value === "" ? null : value;
}

/**
 * Decodes a GTFS-Realtime FeedMessage and returns every vehicle position in it.
 * Only the VehiclePosition fields this site uses are read; everything else is skipped.
 * @param buf The protobuf-encoded FeedMessage.
 * @param feedId Id of the feed, copied onto each result.
 * @returns Vehicle positions that have both a latitude and a longitude.
 */
export function decodeVehiclePositions(buf: Uint8Array, feedId: string): VehiclePosition[] {
  const out: VehiclePosition[] = [];
  for (const entity of fields(buf)) {
    if (entity.num !== 2 || entity.wire !== Wire.Bytes) continue;
    for (const entityField of fields(entity.bytes)) {
      if (entityField.num !== 4 || entityField.wire !== Wire.Bytes) continue;
      const vp: VehiclePosition = {
        feedId,
        vehicleId: null,
        label: null,
        plate: null,
        lat: NaN,
        lon: NaN,
        bearing: null,
        speed: null,
        routeId: null,
        timestamp: null,
      };
      for (const f of fields(entityField.bytes)) {
        if (f.num === 1 && f.wire === Wire.Bytes) {
          for (const trip of fields(f.bytes)) {
            if (trip.num === 5 && trip.wire === Wire.Bytes) vp.routeId = text(trip.bytes);
          }
        } else if (f.num === 2 && f.wire === Wire.Bytes) {
          for (const p of fields(f.bytes)) {
            if (p.wire !== Wire.Fixed32) continue;
            if (p.num === 1) vp.lat = float32(p.bytes);
            else if (p.num === 2) vp.lon = float32(p.bytes);
            else if (p.num === 3) vp.bearing = float32(p.bytes);
            else if (p.num === 5) vp.speed = float32(p.bytes);
          }
        } else if (f.num === 5 && f.wire === Wire.Varint) {
          vp.timestamp = f.int;
        } else if (f.num === 8 && f.wire === Wire.Bytes) {
          for (const v of fields(f.bytes)) {
            if (v.wire !== Wire.Bytes) continue;
            if (v.num === 1) vp.vehicleId = text(v.bytes);
            else if (v.num === 2) vp.label = text(v.bytes);
            else if (v.num === 3) vp.plate = text(v.bytes);
          }
        }
      }
      if (Number.isFinite(vp.lat) && Number.isFinite(vp.lon) && (vp.lat !== 0 || vp.lon !== 0)) out.push(vp);
    }
  }
  return out;
}

/** Loose shape of a GTFS-Realtime entity encoded as JSON, in either snake_case or camelCase. */
interface JsonEntity {
  vehicle?: {
    trip?: { route_id?: string | number; routeId?: string | number };
    vehicle?: { id?: string | number; label?: string | number; license_plate?: string | number; licensePlate?: string | number };
    position?: { latitude?: number; longitude?: number; bearing?: number | string; speed?: number | string };
    timestamp?: number | string;
  };
}

/**
 * Turns a JSON id, label or plate into trimmed text, since some feeds send these as numbers.
 * @param value Raw value from the feed.
 * @returns The text, or null when it is missing or blank.
 */
function jsonText(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * Turns a JSON bearing or speed into a number, since some feeds send these as strings.
 * @param value Raw value from the feed.
 * @returns The number, or null when it is missing or not a number.
 */
function jsonNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads vehicle positions from a GTFS-Realtime feed encoded as JSON, as Auckland Transport and Metlink serve it.
 * @param body Parsed JSON body; either a FeedMessage or one wrapped in a "response" object.
 * @param feedId Id of the feed, copied onto each result.
 * @returns Vehicle positions that have both a latitude and a longitude.
 */
export function vehiclePositionsFromJson(body: unknown, feedId: string): VehiclePosition[] {
  const root = body as { entity?: JsonEntity[]; response?: { entity?: JsonEntity[] } };
  const entities = root.entity ?? root.response?.entity ?? [];
  const out: VehiclePosition[] = [];
  for (const e of entities) {
    const v = e.vehicle;
    const lat = v?.position?.latitude;
    const lon = v?.position?.longitude;
    if (!v || typeof lat !== "number" || typeof lon !== "number") continue;
    out.push({
      feedId,
      vehicleId: jsonText(v.vehicle?.id),
      label: jsonText(v.vehicle?.label),
      plate: jsonText(v.vehicle?.license_plate ?? v.vehicle?.licensePlate),
      lat,
      lon,
      bearing: jsonNumber(v.position?.bearing),
      speed: jsonNumber(v.position?.speed),
      routeId: jsonText(v.trip?.route_id ?? v.trip?.routeId),
      timestamp: v.timestamp == null ? null : Number(v.timestamp),
    });
  }
  return out;
}
