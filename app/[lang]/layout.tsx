import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Atkinson_Hyperlegible_Next, Doto } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "../globals.css";
import { authEnabled } from "@/lib/features";
import { getDictionary, LOCALES } from "./dictionaries";
import { HeaderAccount } from "./header-account";
import { LanguageSwitch } from "./language-switch";

const atkinson = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const doto = Doto({ variable: "--font-doto", subsets: ["latin"], weight: ["700", "800", "900"] });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: { default: dict.site.name, template: `%s · ${dict.site.name}` }, description: dict.site.description };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const dict = await getDictionary();
  const page = (
      <html lang={lang} className={`${atkinson.variable} ${doto.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col font-sans">
          <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
            <Link href={`/${lang}`} className="mr-auto text-lg font-bold tracking-tight">
              {dict.site.name}
            </Link>
            {authEnabled() && (
              <Link href={`/${lang}/add`} className="text-stop underline-offset-4 hover:underline">
                {dict.site.addBus}
              </Link>
            )}
            <Suspense fallback={<Link href={`/${lang === "sv" ? "en" : "sv"}`}>{dict.site.switchLanguage}</Link>}>
              <LanguageSwitch label={dict.site.switchLanguage} />
            </Suspense>
            <Suspense fallback={<span className="w-20" />}>
              <HeaderAccount lang={lang} signIn={dict.site.signIn} review={dict.site.review} />
            </Suspense>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16">{children}</main>
        </body>
      </html>
  );
  return authEnabled() ? <ClerkProvider>{page}</ClerkProvider> : page;
}
