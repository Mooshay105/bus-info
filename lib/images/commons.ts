import "server-only";
import { cacheLife } from "next/cache";
import type { Photo } from "../types";

/** Shape of the parts of a Wikimedia Commons API response this site reads. */
interface CommonsResponse {
  query?: {
    pages?: Record<
      string,
      {
        title: string;
        imageinfo?: {
          url: string;
          thumburl?: string;
          descriptionurl: string;
          mime?: string;
          extmetadata?: Record<string, { value: string } | undefined>;
        }[];
      }
    >;
  };
}

/**
 * Removes the query string, such as tracking parameters, from a Commons image URL.
 * @param url Image URL from the Commons API.
 * @returns The URL without its query string.
 */
function withoutQuery(url: string): string {
  return url.split("?")[0];
}

/** Named HTML entities that appear in Commons metadata, and the characters they stand for. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Strips HTML tags from a Commons metadata value and decodes its entities, such as "&amp;" in an author's name.
 * @param html Value that may contain markup.
 * @returns Plain text.
 */
function plain(html: string | undefined): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (entity, dec?: string, hex?: string, name?: string) => {
      const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : NaN;
      if (Number.isInteger(code)) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      return ENTITIES[name!.toLowerCase()] ?? entity;
    })
    .trim();
}

/**
 * Runs one Wikimedia Commons image search, cached for a day.
 * Throws when the request fails, so a failure is not cached as "no photos".
 * @param phrases Quoted search phrases, OR-ed together.
 * @returns Up to 8 photos with attribution.
 */
async function searchCommons(phrases: string[]): Promise<Photo[]> {
  "use cache";
  cacheLife("days");
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: phrases.join(" OR "),
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "800",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": "buss-info/0.1 (bus lookup site)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Commons answered HTTP ${res.status}`);
  const body = (await res.json()) as CommonsResponse;
  return Object.values(body.query?.pages ?? {}).flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) return [];
    return [
      {
        url: withoutQuery(info.url),
        thumb: withoutQuery(info.thumburl ?? info.url),
        sourceUrl: info.descriptionurl,
        author: plain(info.extmetadata?.Artist?.value) || "Wikimedia Commons",
        licence: plain(info.extmetadata?.LicenseShortName?.value) || null,
        origin: "commons" as const,
      },
    ];
  });
}

/**
 * Searches Wikimedia Commons for photos of a bus.
 * @param terms Search phrases, e.g. the plate and "fleet number + operator"; each is quoted and OR-ed.
 * @returns Up to 8 photos with attribution; empty when nothing matches or the search fails.
 */
export async function commonsPhotos(terms: string[]): Promise<Photo[]> {
  const phrases = terms.filter((t) => t.trim().length >= 3).map((t) => `"${t.replace(/"/g, "")}"`);
  if (phrases.length === 0) return [];
  try {
    return await searchCommons(phrases);
  } catch {
    return [];
  }
}
