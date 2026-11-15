import "server-only";
import { cacheLife } from "next/cache";

/** The fields this site uses from a DVLA Vehicle Enquiry Service response. */
export interface DvlaVehicle {
  /** Plate without spaces. */
  registrationNumber: string;
  /** Manufacturer, e.g. "ALEXANDER DENNIS". */
  make?: string;
  /** Primary colour. */
  colour?: string;
  /** Year of manufacture. */
  yearOfManufacture?: number;
  /** First registration as "YYYY-MM". */
  monthOfFirstRegistration?: string;
  /** Fuel type, e.g. "DIESEL". */
  fuelType?: string;
  /** "Taxed", "SORN" and so on. */
  taxStatus?: string;
  /** "Valid", "Not valid" and so on. */
  motStatus?: string;
}

/**
 * Asks the DVLA Vehicle Enquiry Service about a UK plate, cached for a day.
 * Throws when the request fails for a reason that may pass, so only real answers are cached.
 * @param plate Normalised UK plate.
 * @returns The vehicle, or null when the DVLA does not know the plate.
 */
async function fetchDvla(plate: string): Promise<DvlaVehicle | null> {
  "use cache";
  cacheLife("days");
  const res = await fetch("https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles", {
    method: "POST",
    headers: { "x-api-key": process.env.DVLA_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ registrationNumber: plate }),
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`DVLA answered HTTP ${res.status}`);
  return (await res.json()) as DvlaVehicle;
}

/**
 * Looks up a UK plate with the DVLA Vehicle Enquiry Service.
 * @param plate Normalised UK plate.
 * @returns The vehicle, or null when DVLA_KEY is unset, the plate is unknown or the request fails.
 */
export async function lookupDvla(plate: string): Promise<DvlaVehicle | null> {
  if (!process.env.DVLA_KEY) return null;
  try {
    return await fetchDvla(plate);
  } catch {
    return null;
  }
}
