import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { authEnabled } from "@/lib/features";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { isAdmin } from "@/lib/admin";

export async function HeaderAccount({ lang, signIn, review }: { lang: string; signIn: string; review: string }) {
  if (!authEnabled()) return null;
  const userId = await getUserId();
  if (!userId) {
    return (
      <SignInButton mode="modal">
        <button className="rounded-md bg-ink px-3 py-1.5 text-street">{signIn}</button>
      </SignInButton>
    );
  }
  return (
    <span className="flex items-center gap-4">
      {isAdmin(userId) && (
        <Link href={`/${lang}/admin`} className="text-stop underline-offset-4 hover:underline">
          {review}
        </Link>
      )}
      <UserButton />
    </span>
  );
}
