import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import type en from "./dictionaries/en.json";

/** Loaders for each UI language. */
const dictionaries = {
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  sv: () => import("./dictionaries/sv.json").then((m) => m.default as Dictionary),
};

/** A supported UI language. */
export type Locale = keyof typeof dictionaries;

/** Every UI string, shaped like the English dictionary. */
export type Dictionary = typeof en;

/** Supported UI languages, default first. */
export const LOCALES: Locale[] = ["en", "sv"];

export const hasLocale = (locale: string): locale is Locale => locale in dictionaries;

export async function getLocale(): Promise<Locale> {
  const locale = await lang();
  if (!hasLocale(locale)) notFound();
  return locale;
}

export async function getDictionary(locale?: Locale): Promise<Dictionary> {
  return dictionaries[locale ?? (await getLocale())]();
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
