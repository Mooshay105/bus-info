"use client";

import { useEffect, useState } from "react";
import type { LastSeen } from "@/lib/types";

/** Props for the polling map of one bus. */
interface LiveMapProps {
  /** Bus id used for the location API. */
  busId: number;
  /** Position known when the page rendered. */
  initial: LastSeen | null;
  /** Google Maps Embed API key, if configured. */
  embedKey: string | undefined;
  /** UI language, for relative times. */
  lang: string;
  /** UI strings for this component. */
  labels: { lastSeen: string; onRoute: string; noLocation: string; openMap: string };
}

const POLL_MS = 30_000;

function ago(seconds: number, lang: string): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const diff = Math.round(seconds - Date.now() / 1000);
  if (Math.abs(diff) < 60) return rtf.format(diff, "second");
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function LiveMap({ busId, initial, embedKey, lang, labels }: LiveMapProps) {
  const [seen, setSeen] = useState(initial);
  const [, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/location/${busId}`, { cache: "no-store" });
        if (res.ok && active) setSeen(((await res.json()) as { lastSeen: LastSeen | null }).lastSeen);
      } catch {
        return;
      }
      if (active) setTick((t) => t + 1);
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [busId]);

  if (!seen) return <p className="rounded-md border border-dashed border-rule p-6 text-muted">{labels.noLocation}</p>;

  const where = `${seen.lat.toFixed(5)},${seen.lon.toFixed(5)}`;
  return (
    <figure>
      {embedKey ? (
        <iframe
          title={labels.openMap}
          src={`https://www.google.com/maps/embed/v1/place?key=${embedKey}&q=${where}&zoom=15&language=${lang}`}
          className="aspect-[4/3] w-full rounded-md border border-rule bg-surface"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : null}
      <figcaption className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
        <span>
          {labels.lastSeen.replace("{time}", ago(seen.seen_at, lang))}
          {seen.route_id ? ` ${labels.onRoute.replace("{route}", seen.route_id)}` : ""}
        </span>
        <a href={`https://www.google.com/maps?q=${where}`} className="text-stop underline" target="_blank" rel="noreferrer">
          {labels.openMap}
        </a>
      </figcaption>
    </figure>
  );
}
