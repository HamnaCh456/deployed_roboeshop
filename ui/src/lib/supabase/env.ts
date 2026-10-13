/**
 * The two values every Supabase client needs, read once and checked once.
 *
 * `NEXT_PUBLIC_` is what lets Next inline them into the browser bundle. They
 * are read as literal `process.env.X` expressions on purpose — Next replaces
 * those at build time, and a dynamic lookup like `process.env[name]` would
 * come back undefined in the browser.
 */

export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set — copy ui/.env.example to ui/.env"
    );
  }
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set — copy ui/.env.example to ui/.env"
    );
  }

  return { url, key };
}
