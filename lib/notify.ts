import "server-only";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { edits as editTable, photos as photoTable } from "@/db/schema";
import { getDb } from "./db";
import { emailEnabled } from "./features";

/** Sender used when RESEND_FROM is not set. Resend only delivers it to the address that owns the Resend account. */
const DEFAULT_FROM = "Buss info <onboarding@resend.dev>";

/**
 * Builds the address of the review queue from SITE_URL, or the Vercel production domain.
 * @returns The review page URL, or null when the site address is unknown.
 */
function reviewUrl(): string | null {
  const site = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return site ? `${site.replace(/\/$/, "")}/en/admin` : null;
}

/**
 * Emails the admin that something is waiting for review. Does nothing when email is not configured, and never throws.
 * @param subject Short subject line.
 * @param lines Body lines describing what was submitted.
 */
export async function notifyAdmin(subject: string, lines: string[]): Promise<void> {
  if (!emailEnabled()) return;
  try {
    const db = await getDb();
    const [edits, photos] = await Promise.all([
      db.$count(editTable, eq(editTable.status, "pending")),
      db.$count(photoTable, eq(photoTable.status, "pending")),
    ]);
    const link = reviewUrl();
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: process.env.ADMIN_EMAIL!.split(",").map((a) => a.trim()).filter(Boolean),
      subject: `Buss info: ${subject}`,
      text: [
        ...lines,
        "",
        `Waiting for review: ${edits} edits, ${photos} photos.`,
        link ? `Review them at ${link}` : "Review them on the site's admin page.",
      ].join("\n"),
    });
    if (error) console.error("Review email failed:", error.message);
  } catch (error) {
    console.error("Review email failed:", error instanceof Error ? error.message : error);
  }
}
