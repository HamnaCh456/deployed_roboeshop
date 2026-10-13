/**
 * `/auth/confirm` — where links in auth emails land.
 *
 * Two shapes can arrive. Supabase's default email templates bounce through
 * its hosted verify page and reach us with a PKCE `code`, which
 * `exchangeCodeForSession` turns into a session — that is the path in use,
 * because the free tier does not allow editing the templates. A template that
 * links here directly sends `token_hash` + `type` instead, which `verifyOtp`
 * handles, so switching templates later needs no code change. Either way the
 * session lands in cookies via lib/supabase/server and the browser is sent
 * on to `next`.
 */

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { afterEmailLink } from "../../../components/auth/nextPath";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = afterEmailLink(searchParams.get("next"));

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) redirect(next);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/auth/error");
}
