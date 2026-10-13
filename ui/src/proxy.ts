/**
 * Next 16 proxy (the file convention that replaced middleware.ts). One job:
 * keep the Supabase session fresh — see lib/supabase/proxy. The matcher skips
 * static assets so the refresh does not run for every image.
 */

import type { NextRequest } from "next/server";

import { updateSession } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
