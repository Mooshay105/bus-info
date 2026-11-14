import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { getUserId } from "@/lib/auth";
import { getDictionary, getLocale, type Dictionary, type Locale } from "../dictionaries";
import { reviewEdit, reviewPhoto } from "../actions";
import { isAdmin } from "@/lib/admin";
import { query } from "@/lib/db";

export default async function AdminPage() {
  const lang = await getLocale();
  const dict = await getDictionary(lang);
  return (
    <div className="pt-8">
      <h1 className="text-3xl font-bold">{dict.admin.title}</h1>
      <Suspense fallback={<p className="mt-6 text-muted">…</p>}>
        <Queue lang={lang} dict={dict} />
      </Suspense>
    </div>
  );
}

function Decide({ id, action, dict }: { id: number; action: (formData: FormData) => Promise<void>; dict: Dictionary }) {
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="id" value={id} />
      <button name="decision" value="approve" className="rounded-md bg-ink px-3 py-1.5 text-street">
        {dict.admin.approve}
      </button>
      <button name="decision" value="reject" className="rounded-md border border-ink px-3 py-1.5">
        {dict.admin.reject}
      </button>
    </form>
  );
}

async function Queue({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  // The review queue is per-request data: never run these queries during the build's prerender.
  await connection();

  const userId = await getUserId();
  if (!isAdmin(userId)) return <p className="mt-6">{dict.admin.forbidden}</p>;

  const [edits, photos] = await Promise.all([
    query<{ id: number; bus_id: number | null; author: string | null; changes: string; created_at: string }>(
      "SELECT id, bus_id, author, changes, created_at FROM edits WHERE status = 'pending' ORDER BY id LIMIT 100",
    ),
    query<{ id: number; bus_id: number; url: string; author: string | null }>(
      "SELECT id, bus_id, url, author FROM photos WHERE status = 'pending' ORDER BY id LIMIT 100",
    ),
  ]);

  if (edits.length === 0 && photos.length === 0) return <p className="mt-6 text-muted">{dict.admin.empty}</p>;

  return (
    <div className="mt-8 space-y-12">
      {edits.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">{dict.admin.edits}</h2>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {edits.map((edit) => (
              <li key={edit.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div>
                  <p className="font-bold">
                    {edit.bus_id == null ? (
                      dict.admin.newBus
                    ) : (
                      <Link href={`/${lang}/bus/${edit.bus_id}`} className="text-stop underline">
                        #{edit.bus_id}
                      </Link>
                    )}
                    <span className="font-normal text-muted"> {edit.author ?? ""} {edit.created_at}</span>
                  </p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 text-sm">
                    {Object.entries(JSON.parse(edit.changes) as Record<string, string>).map(([field, value]) => (
                      <div key={field} className="contents">
                        <dt className="text-muted">{field}</dt>
                        <dd>{value === "" ? "∅" : value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <Decide id={Number(edit.id)} action={reviewEdit} dict={dict} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {photos.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">{dict.admin.photos}</h2>
          <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id} className="space-y-2">
                <Image src={photo.url} alt="" width={600} height={450} className="aspect-[4/3] w-full rounded-md object-cover" />
                <p className="text-sm text-muted">
                  <Link href={`/${lang}/bus/${photo.bus_id}`} className="text-stop underline">
                    #{photo.bus_id}
                  </Link>{" "}
                  {photo.author ?? ""}
                </p>
                <Decide id={Number(photo.id)} action={reviewPhoto} dict={dict} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
