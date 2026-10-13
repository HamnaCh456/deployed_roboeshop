/**
 * `?next=` says where to go after signing in. Only a same-site path is
 * honoured: "/community" yes, "https://elsewhere" or "//elsewhere" no — an
 * open redirect is how a sign-in page becomes a phishing page.
 */

/** Where every sign-in and sign-up lands. */
export const AFTER_SIGN_IN = "/dashboard";

/**
 * Where an email link goes once it has made a session: an auth page it names
 * (password recovery sends `next=/auth/update-password`) is kept, anything
 * else becomes the dashboard.
 */
export function afterEmailLink(candidate: string | null): string {
  const next = safeNext(candidate);
  return next.startsWith("/auth/") ? next : AFTER_SIGN_IN;
}

export function safeNext(candidate: string | null, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}
