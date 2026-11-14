import type { Country } from "./types";

/**
 * Normalises a plate, fleet number or vehicle id for matching: upper case, letters and digits only.
 * @param input Raw text typed by a user or read from a feed.
 * @returns The normalised key, or an empty string when nothing is left.
 */
export function normalizeKey(input: string | null | undefined): string {
  return (input ?? "").toUpperCase().replace(/[^A-Z0-9ÅÄÖÆØÜ]/g, "");
}

/** Plate shapes per country, tested against the normalised key. */
const PLATE_PATTERNS: Record<Country, RegExp[]> = {
  GB: [/^[A-Z]{2}\d{2}[A-Z]{3}$/, /^[A-Z]\d{1,3}[A-Z]{3}$/, /^[A-Z]{3}\d{1,3}[A-Z]$/],
  SE: [/^[A-Z]{3}\d{2}[A-Z0-9]$/],
  AU: [/^[A-Z0-9]{2,7}$/],
  NZ: [/^[A-Z]{1,3}\d{1,4}$/, /^[A-Z0-9]{2,6}$/],
};

/**
 * Guesses which countries a plate could belong to from its shape.
 * @param key A key already passed through normalizeKey.
 * @returns Matching countries, most specific first.
 */
export function plateCountries(key: string): Country[] {
  const order: Country[] = ["GB", "SE", "NZ", "AU"];
  return order.filter((country) => PLATE_PATTERNS[country].some((re) => re.test(key)));
}

/**
 * Formats a stored plate for display in its country's usual style.
 * @param plate Plate as stored.
 * @param country Country the plate belongs to.
 * @returns The plate with conventional spacing.
 */
export function formatPlate(plate: string, country: Country): string {
  const key = normalizeKey(plate);
  if (country === "GB" && /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(key)) return `${key.slice(0, 4)} ${key.slice(4)}`;
  if (country === "SE" && /^[A-Z]{3}\d{2}[A-Z0-9]$/.test(key)) return `${key.slice(0, 3)} ${key.slice(3)}`;
  if (country === "AU" && /^\d{4}[A-Z]{2}$/.test(key)) return `${key.slice(0, 4)} ${key.slice(4)}`;
  if (country === "AU" && /^[A-Z]{2}\d{4}$/.test(key)) return `${key.slice(0, 2)} ${key.slice(2)}`;
  return plate.toUpperCase();
}
