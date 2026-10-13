/**
 * The browser-side Supabase client. `@supabase/ssr` keeps the session in
 * cookies rather than localStorage so the same session is visible to route
 * handlers and to `src/proxy.ts`; it also memoises the instance, so calling
 * this from every component is free.
 */

import { createBrowserClient } from "@supabase/ssr";

import { supabaseEnv } from "./env";

export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
