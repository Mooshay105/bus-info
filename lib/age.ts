/** Age of a bus split into whole years and remaining months. */
export interface BusAge {
  /** Whole years. */
  years: number;
  /** Months after the whole years, 0 to 11. */
  months: number;
  /** Whether the age is only known to the year. */
  approximate: boolean;
}

/**
 * Works out how old a bus is from its first registration or build year.
 * @param firstRegistered Date as "YYYY-MM" or "YYYY-MM-DD", preferred when present.
 * @param yearBuilt Build year, used when there is no registration date.
 * @param now The current time.
 * @returns The age, or null when neither date is known.
 */
export function busAge(firstRegistered: string | null, yearBuilt: number | null, now: Date): BusAge | null {
  const match = firstRegistered?.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const total = (now.getFullYear() - Number(match[1])) * 12 + (now.getMonth() + 1 - Number(match[2]));
    if (total < 0) return { years: 0, months: 0, approximate: false };
    return { years: Math.floor(total / 12), months: total % 12, approximate: false };
  }
  if (yearBuilt) return { years: Math.max(0, now.getFullYear() - yearBuilt), months: 0, approximate: true };
  return null;
}
