import { Suspense } from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getUserId } from "@/lib/auth";
import { authEnabled, uploadsEnabled } from "@/lib/features";
import { SignInButton } from "@clerk/nextjs";
import { fill, getDictionary, getLocale, type Dictionary, type Locale } from "../../dictionaries";
import { Plate } from "../../plate";
import { BusFields } from "../../bus-fields";
import { BusForm } from "../../bus-form";
import { suggestEdit } from "../../actions";
import { LiveMap } from "./live-map";
import { PhotoUpload } from "./photo-upload";
import { getBus, getLastSeen } from "@/lib/buses";
import { query } from "@/lib/db";
import { busAge } from "@/lib/age";
import { commonsPhotos } from "@/lib/images/commons";
import { formatPlate } from "@/lib/normalize";
import type { Bus, Photo } from "@/lib/types";

export default async function BusPage({ params }: PageProps<"/[lang]/bus/[id]">) {
  const lang = await getLocale();
  const dict = await getDictionary(lang);
  return (
    <Suspense fallback={<div className="sign mt-6 h-28" />}>
      <BusView lang={lang} dict={dict} params={params} />
    </Suspense>
  );
}

async function BusView({ lang, dict, params }: { lang: Locale; dict: Dictionary; params: Promise<{ id: string }> }) {
  // Per-request data (DB, live location, Commons fetch): never run any of it during the build's prerender.
  await connection();
  const id = Number((await params).id);
  const bus = Number.isInteger(id) ? await getBus(id) : undefined;
  if (!bus) notFound();
  const lastSeen = (await getLastSeen(bus.id)) ?? null;
  const age = busAge(bus.first_registered, bus.year_built, new Date());
  const b = dict.bus;

  const ageText = !age
    ? b.ageUnknown
    : age.approximate
      ? fill(b.ageAbout, { years: age.years })
      : age.years === 0 && age.months === 0
        ? b.ageNew
        : age.months === 0
          ? fill(b.ageYears, { years: age.years })
          : fill(b.ageYearsMonths, { years: age.years, months: age.months });

  const rows: [string, string | number | null][] = [
    [b.plate, bus.plate ? formatPlate(bus.plate, bus.country) : null],
    [b.fleetNumber, bus.fleet_number && bus.fleet_guessed ? `${bus.fleet_number} (${b.fleetGuessedShort})` : bus.fleet_number],
    [b.operator, bus.operator_name],
    [b.country, dict.countries[bus.country]],
    [b.make, bus.make],
    [b.model, bus.model],
    [b.body, bus.body],
    [b.yearBuilt, bus.year_built],
    [b.firstRegistered, bus.first_registered],
    [b.fuel, bus.fuel],
    [b.colour, bus.colour],
    [b.vehicleId, bus.gtfs_vehicle_id],
    [b.status, b.statuses[bus.status as keyof typeof b.statuses] ?? bus.status],
    [b.source, b.sources[bus.source as keyof typeof b.sources] ?? bus.source],
  ];

  return (
    <article className="pt-6">
      <div className="sign flex flex-wrap items-baseline gap-x-8 gap-y-1 px-6 py-5">
        <h1 className={`sign-text sign-scroll break-all ${bus.fleet_number || bus.plate ? "text-5xl sm:text-7xl" : "text-3xl sm:text-4xl"}`}>
          {bus.fleet_number ?? (bus.plate ? formatPlate(bus.plate, bus.country) : (bus.gtfs_vehicle_id ?? "—"))}
        </h1>
        <p className="sign-text text-2xl sm:text-3xl">{bus.operator_name ?? b.unknownOperator}</p>
      </div>
      {bus.fleet_guessed ? <p className="mt-2 text-sm text-muted">{b.fleetGuessed}</p> : null}

      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
        {bus.plate && <Plate plate={bus.plate} country={bus.country} />}
        <p className="text-2xl font-bold sm:text-3xl">{ageText}</p>
      </div>
      {(bus.make || bus.model) && <p className="mt-2 text-lg text-muted">{[bus.make, bus.model, bus.body].filter(Boolean).join(" ")}</p>}

      <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section>
          <h2 className="text-xl font-bold">{b.details}</h2>
          <dl className="mt-3 divide-y divide-rule border-y border-rule">
            {rows
              .filter(([, value]) => value != null && value !== "")
              .map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-bold">{value}</dd>
                </div>
              ))}
          </dl>
        </section>
        <section>
          <h2 className="text-xl font-bold">{b.location}</h2>
          <div className="mt-3">
            <LiveMap
              busId={bus.id}
              initial={lastSeen}
              embedKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY}
              lang={lang}
              labels={{ lastSeen: b.lastSeen, onRoute: b.onRoute, noLocation: b.noLocation, openMap: b.openMap }}
            />
          </div>
        </section>
      </div>

      <section className="mt-14">
        <h2 className="text-xl font-bold">{b.photos}</h2>
        <Suspense fallback={<div className="mt-4 h-48 rounded-md bg-surface" />}>
          <Photos bus={bus} dict={dict} />
        </Suspense>
      </section>

      <section className="mt-14 max-w-3xl">
        <Suspense>
          <Contribute bus={bus} dict={dict} />
        </Suspense>
      </section>
    </article>
  );
}

async function Photos({ bus, dict }: { bus: Bus; dict: Dictionary }) {
  const operator = bus.operator_name?.split(" (")[0];
  const terms = [
    bus.plate ? formatPlate(bus.plate, bus.country) : "",
    bus.fleet_number && operator ? `${operator} ${bus.fleet_number}` : "",
  ];
  const [uploads, commons] = await Promise.all([
    query<{ url: string; author: string | null }>({
      sql: "SELECT url, author FROM photos WHERE bus_id = ? AND status = 'approved' ORDER BY id DESC",
      args: [bus.id],
    }),
    commonsPhotos(terms),
  ]);
  const photos: Photo[] = [
    ...uploads.map((p) => ({ url: p.url, thumb: p.url, sourceUrl: p.url, author: p.author ?? "", licence: null, origin: "upload" as const })),
    ...commons,
  ];
  if (photos.length === 0) return <p className="mt-3 text-muted">{dict.bus.noPhotos}</p>;
  return (
    <ul className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <li key={photo.url}>
          <a href={photo.sourceUrl} target="_blank" rel="noreferrer" className="block">
            <Image
              src={photo.thumb}
              alt={photo.author ? fill(dict.bus.photoBy, { author: photo.author }) : dict.bus.photos}
              width={800}
              height={600}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="aspect-[4/3] w-full rounded-md bg-surface object-cover"
            />
          </a>
          {photo.author && (
            <p className="mt-1 text-sm text-muted">
              {fill(dict.bus.photoBy, { author: photo.author })}
              {photo.licence ? `, ${photo.licence}` : ""}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

async function Contribute({ bus, dict }: { bus: Bus; dict: Dictionary }) {
  const b = dict.bus;
  if (!authEnabled()) return null;
  const userId = await getUserId();
  if (!userId) {
    return (
      <div className="flex flex-wrap gap-3">
        {uploadsEnabled() && (
          <SignInButton mode="modal">
            <button className="rounded-md bg-ink px-4 py-2 text-street">{b.uploadSignIn}</button>
          </SignInButton>
        )}
        <SignInButton mode="modal">
          <button className="rounded-md border border-ink px-4 py-2">{b.editSignIn}</button>
        </SignInButton>
      </div>
    );
  }
  return (
    <div className="space-y-10">
      {uploadsEnabled() && <PhotoUpload busId={bus.id} label={b.upload} done={b.uploadDone} />}
      <details className="group">
        <summary className="cursor-pointer text-xl font-bold">{b.edit}</summary>
        <p className="mt-2 text-muted">{b.editHelp}</p>
        <div className="mt-6">
          <BusForm action={suggestEdit.bind(null, bus.id)} submit={b.send} sent={b.sent}>
            <BusFields dict={dict} bus={bus} />
          </BusForm>
        </div>
      </details>
    </div>
  );
}