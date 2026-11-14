/**
 * Whether Clerk sign-in is configured. Without it, uploads, corrections and the review queue are hidden.
 * @returns True when both Clerk keys are set.
 */
export function authEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

/**
 * Whether photo uploads can work: sign-in plus an Uploadthing token.
 * @returns True when Clerk and UPLOADTHING_TOKEN are both set.
 */
export function uploadsEnabled(): boolean {
  return authEnabled() && Boolean(process.env.UPLOADTHING_TOKEN);
}

/**
 * Whether review emails can be sent: a Resend key plus an address to send them to.
 * @returns True when RESEND_API_KEY and ADMIN_EMAIL are both set.
 */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL);
}
