"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function LanguageSwitch({ label }: { label: string }) {
  const pathname = usePathname();
  const [, current, ...rest] = pathname.split("/");
  const query = useSearchParams().toString();
  const other = current === "sv" ? "en" : "sv";
  return (
    <Link
      href={`/${[other, ...rest].join("/")}${query ? `?${query}` : ""}`}
      hrefLang={other}
      className="text-stop underline-offset-4 hover:underline"
      onClick={() => {
        document.cookie = `lang=${other}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      {label}
    </Link>
  );
}
