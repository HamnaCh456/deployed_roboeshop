/**
 * The Supabase client for route handlers and server components. Reads the
 * session from the request cookies and writes refreshed tokens back.
 *
 * `setAll` can throw when called from a server component (they cannot set
 * cookies). That is fine: the proxy refreshes sessions, so a component that
 * only reads never needs to write.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "./env";

export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* Server component — see above. */
        }
      },
    },
  });
}
