/** Countries the site supports, as ISO 3166-1 alpha-2 codes. */
export type Country = "SE" | "GB" | "AU" | "NZ";

/** Every supported country code, in display order. */
export const COUNTRIES: Country[] = ["SE", "GB", "AU", "NZ"];

/** Every value the status of a bus can have. */
export const STATUSES = ["active", "withdrawn", "unknown"];

/** A bus row joined with its operator name. */
export interface Bus {
  /** Internal id used in URLs. */
  id: number;
  /** Country the bus is registered in. */
  country: Country;
  /** Number plate as written, e.g. "ABC 123". */
  plate: string | null;
  /** Fleet number painted on the bus, e.g. "7234". */
  fleet_number: string | null;
  /** 1 when the fleet number was guessed from the feed's vehicle id and nobody has confirmed it yet. */
  fleet_guessed: number;
  /** Vehicle id used by the realtime feed. */
  gtfs_vehicle_id: string | null;
  /** Id of the realtime feed this bus appears in. */
  feed_id: string | null;
  /** Operator row id. */
  operator_id: number | null;
  /** Operator name, joined from operators. */
  operator_name: string | null;
  /** Chassis or vehicle manufacturer. */
  make: string | null;
  /** Model name. */
  model: string | null;
  /** Bodywork, e.g. "Alexander Dennis Enviro400". */
  body: string | null;
  /** Year the bus was built. */
  year_built: number | null;
  /** First registration as "YYYY-MM" or "YYYY-MM-DD". */
  first_registered: string | null;
  /** Fuel or drivetrain, e.g. "Diesel", "Electric". */
  fuel: string | null;
  /** Main colour or livery. */
  colour: string | null;
  /** "active", "withdrawn" or "unknown". */
  status: string;
  /** Where the record came from: "curated", "dvla" or "feed". */
  source: string;
}

/** Fields a user can suggest changes to. */
export const EDITABLE_FIELDS = [
  "country",
  "plate",
  "fleet_number",
  "gtfs_vehicle_id",
  "feed_id",
  "operator_name",
  "make",
  "model",
  "body",
  "year_built",
  "first_registered",
  "fuel",
  "colour",
  "status",
] as const;

/** One of the fields a user can suggest changes to. */
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** A proposed set of field changes, keyed by field name. */
export type BusChanges = Partial<Record<EditableField, string>>;

/** A single vehicle position read from a realtime feed. */
export interface VehiclePosition {
  /** Feed the position came from. */
  feedId: string;
  /** VehicleDescriptor.id. */
  vehicleId: string | null;
  /** VehicleDescriptor.label, often the fleet number. */
  label: string | null;
  /** VehicleDescriptor.license_plate. */
  plate: string | null;
  /** Latitude in degrees. */
  lat: number;
  /** Longitude in degrees. */
  lon: number;
  /** Heading in degrees clockwise from north. */
  bearing: number | null;
  /** Speed in metres per second. */
  speed: number | null;
  /** Route id from the trip descriptor. */
  routeId: string | null;
  /** Unix time in seconds when the position was recorded. */
  timestamp: number | null;
}

/** Last known location of a bus, as stored in last_seen. */
export interface LastSeen {
  /** Latitude in degrees. */
  lat: number;
  /** Longitude in degrees. */
  lon: number;
  /** Heading in degrees, if known. */
  bearing: number | null;
  /** Speed in metres per second, if known. */
  speed: number | null;
  /** Route id, if known. */
  route_id: string | null;
  /** Unix time in seconds. */
  seen_at: number;
}

/** A photo shown on a bus page. */
export interface Photo {
  /** Full-size image URL. */
  url: string;
  /** Thumbnail URL. */
  thumb: string;
  /** Page to credit and link to. */
  sourceUrl: string;
  /** Photographer or uploader name. */
  author: string;
  /** Licence name, e.g. "CC BY-SA 4.0". */
  licence: string | null;
  /** Where the photo came from. */
  origin: "commons" | "upload";
}
