import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Form from "next/form";
import { fill, getDictionary, getLocale, type Dictionary, type Locale } from "../dictionaries";
import { Plate } from "../plate";
import { searchBuses } from "@/lib/search";
import { authEnabled } from "@/lib/features";

export default async function SearchPage({ searchParams }: PageProps<"/[lang]/search">) {
  const lang = await getLocale();
  const dict = await getDictionary(lang);
  return (
    <div className="pt-8">
      <Suspense fallback={<p className="sign sign-text p-6 text-3xl">…</p>}>
        <Results lang={lang} dict={dict} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({
  lang,
  dict,
  searchParams,
}: {
  lang: Locale;
  dict: Dictionary;
  searchParams: PageProps<"/[lang]/search">["searchParams"];
}) {
  // Search hits the database: render per request only.
  await connection();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const buses = q ? await searchBuses(q) : [];
  if (buses.length === 1) redirect(`/${lang}/bus/${buses[0].id}`);

  return (
    <>
      <Form action={`/${lang}/search`} className="sign flex gap-3 p-3">
        <input
          name="q"
          defaultValue={q}
          aria-label={dict.home.signLabel}
          className="sign-text min-w-0 flex-1 bg-transparent text-2xl uppercase outline-none"
        />
        <button className="rounded-md bg-led px-4 py-2 font-bold text-housing">{dict.home.search}</button>
      </Form>
      {buses.length === 0 ? (
        <div className="mt-10 max-w-[60ch]">
          <h1 className="text-2xl font-bold">{fill(dict.search.none, { q })}</h1>
          <p className="mt-3 text-lg">{dict.search.noneHelp}</p>
          {authEnabled() && (
            <Link
              href={`/${lang}/add?q=${encodeURIComponent(q)}`}
              className="mt-6 inline-block rounded-md bg-ink px-4 py-2 text-street"
            >
              {dict.search.add}
            </Link>
          )}
        </div>
      ) : (
        <>
          <h1 className="mt-10 text-2xl font-bold">{fill(dict.search.results, { n: buses.length, q })}</h1>
          <ul className="mt-6 divide-y divide-rule border-y border-rule">
            {buses.map((bus) => (
              <li key={bus.id}>
                <Link href={`/${lang}/bus/${bus.id}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4 hover:bg-surface">
                  <span className="min-w-16 font-sign text-2xl font-extrabold">
                    {bus.fleet_number ?? "—"}
                    {bus.fleet_guessed ? (
                      <span className="ml-1 font-sans text-sm font-normal text-muted">{dict.bus.fleetGuessedShort}</span>
                    ) : null}
                  </span>
                  {bus.plate ? <Plate plate={bus.plate} country={bus.country} small /> : null}
                  <span>
                    {bus.operator_name ?? dict.bus.unknownOperator}
                    <span className="text-muted">
                      {" "}
                      {[bus.make, bus.model, bus.year_built].filter(Boolean).join(" ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
