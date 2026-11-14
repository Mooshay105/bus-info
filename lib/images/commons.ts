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

/**
 * Strips HTML tags from a Commons metadata value.
 * @param html Value that may contain markup.
 * @returns Plain text.
 */
function plain(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, "").trim();
}

/**
 * Searches Wikimedia Commons for photos of a bus, cached for a day.
 * @param terms Search phrases, e.g. the plate and "fleet number + operator"; each is quoted and OR-ed.
 * @returns Up to 8 photos with attribution.
 */
export async function commonsPhotos(terms: string[]): Promise<Photo[]> {
  "use cache";
  cacheLife("days");
  const phrases = terms.filter((t) => t.trim().length >= 3).map((t) => `"${t.replace(/"/g, "")}"`);
  if (phrases.length === 0) return [];
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
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "buss-info/0.1 (bus lookup site)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
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
  } catch {
    return [];
  }
}
