/**
 * Supabase's auth errors are accurate and unhelpful ("Invalid login
 * credentials"). Each one is reworded to say what to do next (DESIGN.md §8).
 * Anything unrecognised falls through with its own message, because a message
 * we have not seen is one we should not paper over.
 */

import type { AuthError } from "@supabase/supabase-js";

export function describeAuthError(error: AuthError | Error): string {
  const text = error.message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "That email and password don't match. Try again, or reset your password.";
  }
  if (
    text.includes("already registered") ||
    text.includes("already been registered")
  ) {
    return "There's already an account for that email. Sign in instead.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirm your email first — the link is in your inbox.";
  }
  if (text.includes("password should be at least")) {
    return "Use at least 8 characters for the password.";
  }
  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "Too many attempts for now. Wait a few minutes and try again.";
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("network")
  ) {
    return "Couldn't reach the sign-in service. Check your connection; if it's fine, the account server is down, so try again later.";
  }
  return error.message;
}
