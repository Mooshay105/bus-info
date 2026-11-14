/**
 * Checks whether a Clerk user may approve edits and photos.
 * @param userId Clerk user id, or null when signed out.
 * @returns True when the id is listed in ADMIN_USER_IDS (comma separated).
 */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .includes(userId);
}
