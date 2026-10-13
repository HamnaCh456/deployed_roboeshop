/**
 * Refreshes the auth session on every request that reaches the proxy.
 *
 * Access tokens expire hourly. Without this, a browser that sat on a page for
 * an hour would send an expired token on its next write and be told to sign
 * in again. The `getClaims()` call is what triggers the refresh; the cookie
 * dance around it is how the refreshed token gets back to the browser — the
 * request cookies for this render, the response cookies for the next.
 *
 * Deliberately no redirects: nothing on this site is behind a login wall.
 * Pages gate their own write controls with `useAuth()`.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not put anything between the client creation and this call: the
  // refresh happens here, and code that runs before it sees a stale session.
  //
  // Capped, and never fatal. When Supabase cannot be reached (a paused
  // project, no network) supabase-js retries with backoff, and that held every
  // page for ~26 s. Reading is public, so a page must not wait on the session:
  // after REFRESH_BUDGET_MS it is served as it stands and the refresh is left
  // to the next request.
  await Promise.race([
    supabase.auth.getClaims().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, REFRESH_BUDGET_MS)),
  ]);

  return response;
}

/** Long enough for a normal token refresh, short enough not to be noticed. */
const REFRESH_BUDGET_MS = 3000;
