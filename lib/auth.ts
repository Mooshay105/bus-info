import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { authEnabled } from "./features";

/**
 * Returns the signed-in Clerk user id, or null when signed out or when Clerk isn't configured.
 * @returns The user id or null.
 */
export async function getUserId(): Promise<string | null> {
  if (!authEnabled()) return null;
  return (await auth()).userId;
}

/**
 * Returns a display name for the signed-in user, for crediting edits and photos.
 * @returns Username or full name, or null when unknown or Clerk isn't configured.
 */
export async function getAuthorName(): Promise<string | null> {
  if (!authEnabled()) return null;
  const user = await currentUser();
  return user?.username ?? user?.fullName ?? null;
}
