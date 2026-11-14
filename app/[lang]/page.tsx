import Form from "next/form";
import { getDictionary, getLocale } from "./dictionaries";
import { Plate } from "./plate";
import { COUNTRIES } from "@/lib/types";

export default async function Home() {
  const lang = await getLocale();
  const dict = await getDictionary(lang);
  return (
    <div className="pt-10 sm:pt-20">
      <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{dict.home.title}</h1>
      <Form action={`/${lang}/search`} className="sign mt-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-6">
        <label htmlFor="q" className="sr-only">
          {dict.home.signLabel}
        </label>
        <input
          id="q"
          name="q"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={dict.home.placeholder}
          className="sign-text sign-scroll min-w-0 flex-1 bg-transparent text-3xl uppercase outline-none sm:text-5xl"
        />
        <button className="rounded-md bg-led px-5 py-3 text-lg font-bold text-housing hover:brightness-110">
          {dict.home.search}
        </button>
      </Form>
      <p className="mt-8 max-w-[60ch] text-lg leading-relaxed">{dict.home.intro}</p>
      <h2 className="mt-12 text-xl font-bold">{dict.home.formatsTitle}</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {dict.home.formats.map(([name, example], i) => (
          <li key={name} className="flex items-center gap-4">
            <Plate plate={example} country={COUNTRIES[i]} small />
            <span>{name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-10 max-w-[60ch] text-muted">{dict.home.coverage}</p>
    </div>
  );
}
