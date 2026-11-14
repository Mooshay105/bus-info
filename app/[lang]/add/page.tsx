import { Suspense } from "react";
import { connection } from "next/server";
import { getUserId } from "@/lib/auth";
import { authEnabled } from "@/lib/features";
import { SignInButton } from "@clerk/nextjs";
import { getDictionary, getLocale, type Dictionary } from "../dictionaries";
import { BusFields } from "../bus-fields";
import { BusForm } from "../bus-form";
import { proposeBus } from "../actions";
import { normalizeKey, plateCountries } from "@/lib/normalize";

export default async function AddPage({ searchParams }: PageProps<"/[lang]/add">) {
  const dict = await getDictionary(await getLocale());
  return (
    <div className="max-w-3xl pt-8">
      <h1 className="text-3xl font-bold">{dict.add.title}</h1>
      <p className="mt-3 max-w-[60ch] text-lg">{dict.add.help}</p>
      <div className="mt-8">
        <Suspense>
          <AddForm dict={dict} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function AddForm({ dict, searchParams }: { dict: Dictionary; searchParams: PageProps<"/[lang]/add">["searchParams"] }) {
  // Depends on the signed-in user and the query string: render per request only.
  await connection();
  if (!authEnabled()) return <p className="text-muted">{dict.add.off}</p>;
  const userId = await getUserId();
  if (!userId) {
    return (
      <SignInButton mode="modal">
        <button className="rounded-md bg-ink px-4 py-2 text-street">{dict.add.signIn}</button>
      </SignInButton>
    );
  }
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const country = plateCountries(normalizeKey(q))[0];
  const looksLikePlate = country !== undefined && /[A-Z]/i.test(q) && /\d/.test(q);
  return (
    <BusForm action={proposeBus} submit={dict.add.send} sent={dict.add.sent} required={dict.add.required}>
      <BusFields
        dict={dict}
        bus={looksLikePlate ? { plate: q.toUpperCase(), country } : q ? { fleet_number: q } : {}}
      />
    </BusForm>
  );
}
