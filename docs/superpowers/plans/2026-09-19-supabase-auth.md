# Supabase Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email + password accounts on the Servo UI, with a public `profiles` table holding each account's display name, so writing on `/community` needs a sign-in and every review is signed with the account's name.

**Architecture:** `@supabase/ssr` cookie sessions shared by a browser client (pages), a server client (route handlers) and a `src/proxy.ts` that refreshes the token per request. One `AuthProvider` observes the session and exposes `useAuth()`; the navbar and the community page read it. Auth pages are client components under `src/app/auth/*`, styled by their own `auth.css`. Spec: [docs/superpowers/specs/2026-09-19-supabase-auth-design.md](../specs/2026-09-19-supabase-auth-design.md).

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, `@supabase/supabase-js` 2.116, `@supabase/ssr` 0.12, Supabase Postgres 17 (project `gqhkibhaaomeffaxzkio`). Database and project settings are applied through the Supabase Management API with the personal access token stored in `~/.claude.json` under the RobotEShop project's `supabase` MCP entry (`$PAT` below). **In this session the `mcp__supabase__*` tools still point at a different project — use `curl`, never those tools, until a fresh session picks up the local override.**

**Verification bar (CLAUDE.md):** there is no UI test harness. Each UI task ends with `npx tsc --noEmit` and the final task runs `npm run build`, `npm run lint`, and a browser walk-through. Database tasks verify with SQL.

---

## File map

| File | Responsibility |
|---|---|
| `ui/.env.example`, `ui/.env` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `ui/src/lib/supabase/env.ts` | Reads the two env vars, throws naming the missing one |
| `ui/src/lib/supabase/client.ts` | `createClient()` for the browser |
| `ui/src/lib/supabase/server.ts` | `createClient()` for route handlers (cookies from `next/headers`) |
| `ui/src/lib/supabase/proxy.ts` | `updateSession(request)` — token refresh, cookie write-back |
| `ui/src/proxy.ts` | Next 16 proxy entry; calls `updateSession` |
| `ui/src/context/AuthContext.tsx` | `AuthProvider`, `useAuth()`, `Profile` type |
| `ui/src/app/providers.tsx` | mounts `AuthProvider` |
| `ui/src/auth.css` | tokens + card for the auth pages |
| `ui/src/components/auth/AuthCard.tsx` | card shell |
| `ui/src/components/auth/errors.ts` | `describeAuthError()` — Supabase messages → what to do next |
| `ui/src/components/auth/nextPath.ts` | `safeNext()` — only same-origin paths |
| `ui/src/components/auth/LoginForm.tsx` | |
| `ui/src/components/auth/SignUpForm.tsx` | |
| `ui/src/components/auth/ForgotPasswordForm.tsx` | |
| `ui/src/components/auth/UpdatePasswordForm.tsx` | |
| `ui/src/app/auth/{login,sign-up,forgot-password,update-password,error}/page.tsx` | thin pages |
| `ui/src/app/auth/confirm/route.ts` | verifies a `token_hash` or exchanges a `code`, then redirects |
| `ui/src/components/Navbar.tsx` | sign-in link / name + sign-out |
| `ui/src/components/community/{Community,ReviewForm,ReplyThread,ReviewCard}.tsx` | gating; name from profile |
| `ui/src/data/reviewStore.ts` | drop the remembered-name key |
| `CLAUDE.md`, `docs/PAGES.md` | document the routes and the rule |

---

### Task 1: The `profiles` table and its trigger

**Files:** none in the repo — this is a database migration, applied remotely and recorded by Supabase.

- [ ] **Step 1: Confirm the token reaches the right project**

Run (Bash; substitute the token from `~/.claude.json` → `projects["C:\Users\LENOVO\Desktop\RobotEShop"].mcpServers.supabase.env.SUPABASE_ACCESS_TOKEN`):

```bash
PAT=sbp_...; curl -s -H "Authorization: Bearer $PAT" https://api.supabase.com/v1/projects | python -c "import sys,json;[print(p['id'],p['name']) for p in json.load(sys.stdin)]"
```

Expected: exactly one line, `gqhkibhaaomeffaxzkio RobotEShop`.

- [ ] **Step 2: Write the migration to the scratchpad**

Write `<scratchpad>/001_profiles.sql`:

```sql
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is
  'One row per account. display_name is what a review is signed with; it is given once at sign-up and copied here by handle_new_user().';

alter table public.profiles enable row level security;

create policy "profiles are public"
  on public.profiles for select
  using (true);

create policy "owners update their profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Someone')
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Apply it as a named migration**

```bash
python - <<'EOF'
import json, os, urllib.request
pat = os.environ["PAT"]; ref = "gqhkibhaaomeffaxzkio"
sql = open(os.path.join(os.environ["SCRATCH"], "001_profiles.sql"), encoding="utf-8").read()
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/migrations",
    data=json.dumps({"name": "profiles", "query": sql}).encode(),
    headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json"},
    method="POST")
print(urllib.request.urlopen(req).read().decode())
EOF
```

Expected: a JSON body with no `"message"` error. If the endpoint returns 404, fall back to `POST …/database/query` with `{"query": sql}` — the schema lands either way, only the migration record is lost.

- [ ] **Step 4: Verify**

```bash
curl -s -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  https://api.supabase.com/v1/projects/gqhkibhaaomeffaxzkio/database/query \
  -d '{"query":"select relname, relrowsecurity from pg_class where relname = '"'"'profiles'"'"'; select tgname from pg_trigger where tgname = '"'"'on_auth_user_created'"'"'; select policyname from pg_policies where tablename = '"'"'profiles'"'"';"}'
```

Expected: `profiles` with `relrowsecurity: true`; the trigger name; two policy names.

---

### Task 2: Project auth settings

**Files:** none in the repo. Recorded in the spec's *Project configuration* table.

- [ ] **Step 1: Read the current config**

```bash
curl -s -H "Authorization: Bearer $PAT" https://api.supabase.com/v1/projects/gqhkibhaaomeffaxzkio/config/auth | python -c "import sys,json;c=json.load(sys.stdin);print({k:c.get(k) for k in ['site_url','uri_allow_list','mailer_autoconfirm','password_min_length','external_email_enabled']})"
```

- [ ] **Step 2: Apply the settings**

The recovery email template is switched to a `token_hash` link so the reset flow lands on our `/auth/confirm` route deterministically instead of relying on the hosted verify page's redirect.

```bash
python - <<'EOF'
import json, os, urllib.request
pat = os.environ["PAT"]; ref = "gqhkibhaaomeffaxzkio"
body = {
  "site_url": "http://localhost:3000",
  "uri_allow_list": "http://localhost:3000/**",
  "mailer_autoconfirm": True,
  "password_min_length": 8,
  "mailer_subjects_recovery": "Reset your Servo password",
  "mailer_templates_recovery_content": (
    "<h2>Reset your password</h2>"
    "<p>Follow this link to choose a new password for Servo:</p>"
    "<p><a href=\"{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password\">Reset password</a></p>"
    "<p>If you did not ask for this, ignore it.</p>"),
}
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/config/auth",
    data=json.dumps(body).encode(),
    headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json"},
    method="PATCH")
print(urllib.request.urlopen(req).read().decode()[:400])
EOF
```

- [ ] **Step 3: Verify**

Re-run Step 1. Expected: `site_url` `http://localhost:3000`, `mailer_autoconfirm` `True`, `password_min_length` `8`, `uri_allow_list` `http://localhost:3000/**`.

---

### Task 3: Dependencies and environment

**Files:**
- Modify: `ui/package.json` (via npm)
- Modify: `ui/.env.example`
- Create: `ui/.env` (gitignored by the root `.env` rule)
- Create: `ui/src/lib/supabase/env.ts`

- [ ] **Step 1: Install**

```bash
cd ui && npm install @supabase/supabase-js@^2.116.0 @supabase/ssr@^0.12.7
```

Expected: both appear under `dependencies` in `package.json`; no peer warnings about React.

- [ ] **Step 2: Env example**

Replace `ui/.env.example` with:

```bash
# Copy to .env for local development. Points the UI at the mock server
# (`cd mock-server && node server.js`) instead of the nginx `/api` proxy that
# the Docker deployment provides.
NEXT_PUBLIC_API_BASE_URL=http://localhost:8009

# Supabase — accounts and, next, community reviews. Both values are safe to
# ship to the browser: the publishable key can only do what row-level security
# allows. Project settings → API in the Supabase dashboard.
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

- [ ] **Step 3: Local env**

Write `ui/.env` (if it exists, append the two Supabase lines):

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8009
NEXT_PUBLIC_SUPABASE_URL=https://gqhkibhaaomeffaxzkio.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YRfIz9l562v5inwelnzeFQ_syhEIMo5
```

Confirm `git status` does not list `ui/.env`.

- [ ] **Step 4: One place that knows the variable names**

Create `ui/src/lib/supabase/env.ts`:

```ts
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

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — copy ui/.env.example to ui/.env");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set — copy ui/.env.example to ui/.env");

  return { url, key };
}
```

- [ ] **Step 5: Type check and commit**

```bash
cd ui && npx tsc --noEmit
cd .. && git add ui/package.json ui/package-lock.json ui/.env.example ui/src/lib/supabase/env.ts
git commit -m "Add the Supabase client libraries and env contract"
```

---

### Task 4: Supabase clients and the session proxy

**Files:**
- Create: `ui/src/lib/supabase/client.ts`
- Create: `ui/src/lib/supabase/server.ts`
- Create: `ui/src/lib/supabase/proxy.ts`
- Create: `ui/src/proxy.ts`

- [ ] **Step 1: Browser client**

```ts
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
```

- [ ] **Step 2: Server client**

```ts
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
```

- [ ] **Step 3: Session refresh**

`ui/src/lib/supabase/proxy.ts`:

```ts
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
  await supabase.auth.getClaims();

  return response;
}
```

- [ ] **Step 4: Proxy entry**

`ui/src/proxy.ts` (Next 16 renamed `middleware.ts` to `proxy.ts`; the export must be named `proxy`):

```ts
/**
 * Next 16 proxy. One job: keep the Supabase session fresh (lib/supabase/proxy).
 * The matcher skips static assets so the refresh does not run for every image.
 */

import type { NextRequest } from "next/server";

import { updateSession } from "./lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.png|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

- [ ] **Step 5: Type check, smoke the proxy, commit**

```bash
cd ui && npx tsc --noEmit && npm run build 2>&1 | tail -20
```

Expected: build succeeds and the route summary lists `ƒ Proxy` (or "Middleware") — that line proves the file was picked up.

```bash
cd .. && git add ui/src/lib/supabase ui/src/proxy.ts
git commit -m "Add the Supabase clients and the session-refresh proxy"
```

---

### Task 5: `AuthProvider` and `useAuth()`

**Files:**
- Create: `ui/src/context/AuthContext.tsx`
- Modify: `ui/src/app/providers.tsx`

- [ ] **Step 1: The context**

```tsx
"use client";

/**
 * Who is signed in, for the whole app.
 *
 * This is the only file that knows how a session is observed. Everything else
 * — the navbar, the community page — asks `useAuth()` and gets three things:
 * a status, the Supabase user, and the profile row that holds the display
 * name. `status` starts as "loading" so a page can hold its write controls
 * disabled instead of flashing "Sign in" at someone who is signed in.
 *
 * The profile is fetched in its own effect keyed on the user id, not inside
 * the `onAuthStateChange` callback: awaiting a Supabase call inside that
 * callback deadlocks the client (documented in supabase-js).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "../lib/supabase/client";

export interface Profile {
  id: string;
  displayName: string;
}

export type AuthStatus = "loading" | "signed-out" | "signed-in";

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  /** Null while loading, while signed out, and for the instant between
      sign-up and the trigger writing the row — callers fall back to
      `user.user_metadata.display_name` through `displayName` below. */
  profile: Profile | null;
  /** The name to sign things with. "" when signed out. */
  displayName: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (error) {
      // Missing env. Log the one line that says which, and behave as a site
      // with no accounts rather than a site that never finishes loading.
      console.error(error);
      setStatus("signed-out");
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session ? "signed-in" : "signed-out");
    });

    // `onAuthStateChange` fires INITIAL_SESSION on subscribe, so no separate
    // getSession() call is needed — one path, not two that can disagree.
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let live = true;
    createClient()
      .from("profiles")
      .select("id, display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live || !data) return;
        setProfile({ id: data.id, displayName: data.display_name });
      });
    return () => {
      live = false;
    };
  }, [user]);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const fromMetadata =
      typeof user?.user_metadata?.display_name === "string"
        ? (user.user_metadata.display_name as string)
        : "";
    return {
      status,
      user,
      profile,
      displayName: profile?.displayName ?? fromMetadata,
      signOut,
    };
  }, [status, user, profile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth() must be used inside <AuthProvider>");
  }
  return value;
}
```

- [ ] **Step 2: Mount it**

`ui/src/app/providers.tsx` — replace the component body:

```tsx
"use client";

/**
 * Everything the root layout mounts that needs to be a client component:
 * who is signed in, the cross-route render-image state and the toast outlet.
 * The layout itself stays a server component so the <html> shell and
 * metadata are static.
 */

import React from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { AuthProvider } from "../context/AuthContext";
import { RenderImageProvider } from "../context/RenderImageContext";

const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <RenderImageProvider>
      {children}
      <ToastContainer position="top-right" />
    </RenderImageProvider>
  </AuthProvider>
);

export default Providers;
```

- [ ] **Step 3: Type check and commit**

```bash
cd ui && npx tsc --noEmit
cd .. && git add ui/src/context/AuthContext.tsx ui/src/app/providers.tsx
git commit -m "Add AuthProvider: one place that observes the session"
```

---

### Task 6: Auth page styling and shared pieces

**Files:**
- Create: `ui/src/auth.css`
- Create: `ui/src/components/auth/AuthCard.tsx`
- Create: `ui/src/components/auth/errors.ts`
- Create: `ui/src/components/auth/nextPath.ts`

- [ ] **Step 1: Stylesheet**

`ui/src/auth.css`:

```css
/**
 * Auth pages — sign in, sign up, password reset.
 *
 * One centred card on the panel ground. Tokens are redeclared here rather than
 * imported from community.css for the same reason that file does not import
 * tutorials.css: each page's styling loads and edits on its own (CLAUDE.md).
 * Values are DESIGN.md's: field border #D8D8D8, green focus ring, 10px inputs,
 * 15px pill button, ink/slate/muted text.
 *
 * No header band. The card is the whole page, so it sits in the vertical
 * middle of the space under the navbar — a form at the top-left of a blank
 * page reads as a broken layout.
 */

.auth {
  --primary: #76b900;
  --ink: #101826;
  --slate: #5a6678;
  --muted: #666666;
  --rule: #d8dee7;
  --field: #d8d8d8;
  --panel: #f9f9f9;
  --error: #b3261e;

  /* 106px is the navbar plus the category strip, matching the other pages. */
  min-height: calc(100vh - 106px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  box-sizing: border-box;
  background: var(--panel);
  font-family: "NVIDIA Sans", sans-serif;
  color: var(--ink);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: #ffffff;
  border: 1px solid var(--rule);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(16, 24, 38, 0.08);
  padding: 28px 28px 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.auth-card__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-card__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}

.auth-card__lead {
  margin: 0;
  color: var(--slate);
  font-size: 13.5px;
  line-height: 1.5;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-field__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.auth-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.auth-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--field);
  border-radius: 10px;
  padding: 10px 14px;
  font: inherit;
  font-size: 14px;
  color: var(--ink);
  background: #ffffff;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.auth-input::placeholder {
  color: #9aa4b2;
}

.auth-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(118, 185, 0, 0.15);
}

.auth-input--invalid {
  border-color: var(--error);
}

/* Errors say what to do, not that something is invalid (DESIGN.md §8). */
.auth-error {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--error);
}

/* A result of the last action — "check your inbox" — not an error. */
.auth-notice {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(118, 185, 0, 0.1);
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ink);
}

.auth-button {
  border: 0;
  border-radius: 15px;
  background: var(--primary);
  color: #ffffff;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  padding: 10px 20px;
  cursor: pointer;
  transition: filter 0.15s ease;
  margin-top: 4px;
}

.auth-button:hover:not(:disabled) {
  filter: brightness(0.93);
}

.auth-button:disabled {
  opacity: 0.55;
  cursor: default;
}

.auth-link {
  font-size: 13px;
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.auth-link:hover {
  color: #5f9600;
}

.auth-foot {
  margin: 0;
  padding-top: 14px;
  border-top: 1px solid #ececec;
  font-size: 13px;
  color: var(--slate);
}
```

- [ ] **Step 2: Card shell**

`ui/src/components/auth/AuthCard.tsx`:

```tsx
"use client";

/**
 * The shell every auth page renders into: a title, one line of lead, the
 * form, and a footer that holds the one link out (sign up ↔ sign in).
 */

import React from "react";

import "../../auth.css";

interface AuthCardProps {
  title: string;
  lead: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}

const AuthCard: React.FC<AuthCardProps> = ({ title, lead, children, foot }) => (
  <main className="auth">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-card__head">
        <h1 className="auth-card__title" id="auth-title">
          {title}
        </h1>
        <p className="auth-card__lead">{lead}</p>
      </div>
      {children}
      {foot && <p className="auth-foot">{foot}</p>}
    </section>
  </main>
);

export default AuthCard;
```

- [ ] **Step 3: Error wording**

`ui/src/components/auth/errors.ts`:

```ts
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
  if (text.includes("already registered") || text.includes("already been registered")) {
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
  if (text.includes("failed to fetch") || text.includes("fetch failed") || text.includes("network")) {
    return "Couldn't reach the sign-in service. Check your connection and try again.";
  }
  return error.message;
}
```

- [ ] **Step 4: Safe redirect target**

`ui/src/components/auth/nextPath.ts`:

```ts
/**
 * `?next=` says where to go after signing in. Only a same-site path is
 * honoured: "/community" yes, "https://elsewhere" or "//elsewhere" no — an
 * open redirect is how a sign-in page becomes a phishing page.
 */

export function safeNext(candidate: string | null, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}
```

- [ ] **Step 5: Type check and commit**

```bash
cd ui && npx tsc --noEmit
cd .. && git add ui/src/auth.css ui/src/components/auth
git commit -m "Add the auth card, its stylesheet, and the error wording"
```

---

### Task 7: Log in and sign up

**Files:**
- Create: `ui/src/components/auth/LoginForm.tsx`
- Create: `ui/src/components/auth/SignUpForm.tsx`
- Create: `ui/src/app/auth/login/page.tsx`
- Create: `ui/src/app/auth/sign-up/page.tsx`

- [ ] **Step 1: Login form**

```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";

import { createClient } from "../../lib/supabase/client";
import AuthCard from "./AuthCard";
import { describeAuthError } from "./errors";
import { safeNext } from "./nextPath";

const LoginForm: React.FC = () => {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setIsBusy(true);
    setError(null);
    const { error: failure } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsBusy(false);

    if (failure) {
      setError(describeAuthError(failure));
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <AuthCard
      title="Sign in"
      lead="Reviews and replies are signed with your account name."
      foot={
        <>
          No account yet?{" "}
          <Link className="auth-link" href={`/auth/sign-up?next=${encodeURIComponent(next)}`}>
            Sign up
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="auth-field">
          <div className="auth-field__row">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <Link className="auth-link" href="/auth/forgot-password">
              Forgot password?
            </Link>
          </div>
          <input
            id="auth-password"
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="auth-button" disabled={isBusy}>
          {isBusy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
};

export default LoginForm;
```

- [ ] **Step 2: Sign-up form**

```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";

import { createClient } from "../../lib/supabase/client";
import AuthCard from "./AuthCard";
import { describeAuthError } from "./errors";
import { safeNext } from "./nextPath";

/* Mirrors the check constraint on profiles.display_name and the project's
   password_min_length, so the server never rejects what the form accepted. */
const NAME_MIN = 2;
const NAME_MAX = 40;
const PASSWORD_MIN = 8;

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

const SignUpForm: React.FC = () => {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/community");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Only reached if email confirmation is turned back on in the project.
  const [awaitingEmail, setAwaitingEmail] = useState(false);

  const validate = (): Errors => {
    const found: Errors = {};
    const trimmedName = name.trim();
    if (trimmedName.length < NAME_MIN || trimmedName.length > NAME_MAX) {
      found.name = `Pick a name between ${NAME_MIN} and ${NAME_MAX} characters — it signs your reviews.`;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      found.email = "Enter an email address you can receive mail at.";
    }
    if (password.length < PASSWORD_MIN) {
      found.password = `Use at least ${PASSWORD_MIN} characters.`;
    }
    if (confirm !== password) {
      found.confirm = "The two passwords don't match — type them again.";
    }
    return found;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsBusy(true);
    setFailure(null);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      // Copied into profiles.display_name by the handle_new_user trigger.
      options: { data: { display_name: name.trim() } },
    });
    setIsBusy(false);

    if (error) {
      setFailure(describeAuthError(error));
      return;
    }
    if (!data.session) {
      setAwaitingEmail(true);
      return;
    }
    router.push(next);
    router.refresh();
  };

  const field = (key: keyof Errors) =>
    "auth-input" + (errors[key] ? " auth-input--invalid" : "");

  return (
    <AuthCard
      title="Create an account"
      lead="One name, used on everything you write here."
      foot={
        <>
          Already have one?{" "}
          <Link className="auth-link" href={`/auth/login?next=${encodeURIComponent(next)}`}>
            Sign in
          </Link>
        </>
      }
    >
      {awaitingEmail ? (
        <p className="auth-notice">
          Check your inbox — there is a confirmation link waiting. Once you have
          followed it, sign in.
        </p>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-name">
              Display name
            </label>
            <input
              id="auth-name"
              className={field("name")}
              type="text"
              autoComplete="nickname"
              maxLength={NAME_MAX}
              value={name}
              aria-invalid={Boolean(errors.name) || undefined}
              onChange={(event) => setName(event.target.value)}
              placeholder="A name or a handle"
            />
            {errors.name && <p className="auth-error">{errors.name}</p>}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className={field("email")}
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={Boolean(errors.email) || undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {errors.email && <p className="auth-error">{errors.email}</p>}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className={field("password")}
              type="password"
              autoComplete="new-password"
              value={password}
              aria-invalid={Boolean(errors.password) || undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
            {errors.password && <p className="auth-error">{errors.password}</p>}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-confirm">
              Password again
            </label>
            <input
              id="auth-confirm"
              className={field("confirm")}
              type="password"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={Boolean(errors.confirm) || undefined}
              onChange={(event) => setConfirm(event.target.value)}
            />
            {errors.confirm && <p className="auth-error">{errors.confirm}</p>}
          </div>

          {failure && <p className="auth-error" role="alert">{failure}</p>}

          <button type="submit" className="auth-button" disabled={isBusy}>
            {isBusy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}
    </AuthCard>
  );
};

export default SignUpForm;
```

- [ ] **Step 3: Pages**

`useSearchParams` needs a Suspense boundary in a statically prerendered page (CLAUDE.md), so each page provides one.

`ui/src/app/auth/login/page.tsx`:

```tsx
"use client";

import React, { Suspense } from "react";

import LoginForm from "../../../components/auth/LoginForm";

/** `/auth/login`. The form reads `?next=`, hence the Suspense boundary. */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
```

`ui/src/app/auth/sign-up/page.tsx`:

```tsx
"use client";

import React, { Suspense } from "react";

import SignUpForm from "../../../components/auth/SignUpForm";

/** `/auth/sign-up`. The form reads `?next=`, hence the Suspense boundary. */
export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
```

- [ ] **Step 4: Type check and commit**

```bash
cd ui && npx tsc --noEmit
cd .. && git add ui/src/components/auth/LoginForm.tsx ui/src/components/auth/SignUpForm.tsx ui/src/app/auth
git commit -m "Add the sign-in and sign-up pages"
```

---

### Task 8: Password reset, the confirm route, and the error page

**Files:**
- Create: `ui/src/components/auth/ForgotPasswordForm.tsx`
- Create: `ui/src/components/auth/UpdatePasswordForm.tsx`
- Create: `ui/src/app/auth/forgot-password/page.tsx`
- Create: `ui/src/app/auth/update-password/page.tsx`
- Create: `ui/src/app/auth/confirm/route.ts`
- Create: `ui/src/app/auth/error/page.tsx`

- [ ] **Step 1: Forgot-password form**

```tsx
"use client";

import Link from "next/link";
import React, { useState } from "react";

import { createClient } from "../../lib/supabase/client";
import AuthCard from "./AuthCard";
import { describeAuthError } from "./errors";

const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter the email you signed up with.");
      return;
    }

    setIsBusy(true);
    setError(null);
    const { error: failure } = await createClient().auth.resetPasswordForEmail(
      email.trim(),
      {
        // The recovery email template links to /auth/confirm with a
        // token_hash; `next` is where that route sends the browser after.
        redirectTo: `${window.location.origin}/auth/confirm?next=/auth/update-password`,
      }
    );
    setIsBusy(false);

    // A rate-limit or network failure is worth showing; "no such user" is
    // not, and Supabase does not return it anyway. Either way the page
    // must not reveal which addresses have accounts.
    if (failure && !failure.message.toLowerCase().includes("user")) {
      setError(describeAuthError(failure));
      return;
    }
    setSent(true);
  };

  return (
    <AuthCard
      title="Reset your password"
      lead="We'll email you a link that lets you choose a new one."
      foot={
        <Link className="auth-link" href="/auth/login">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="auth-notice">
          If that address has an account, a reset link is on its way. It can
          take a minute to arrive.
        </p>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-button" disabled={isBusy}>
            {isBusy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
};

export default ForgotPasswordForm;
```

- [ ] **Step 2: Update-password form**

```tsx
"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";

import { createClient } from "../../lib/supabase/client";
import AuthCard from "./AuthCard";
import { describeAuthError } from "./errors";

const PASSWORD_MIN = 8;

const UpdatePasswordForm: React.FC = () => {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (confirm !== password) {
      setError("The two passwords don't match — type them again.");
      return;
    }

    setIsBusy(true);
    setError(null);
    const { error: failure } = await createClient().auth.updateUser({ password });
    setIsBusy(false);

    if (failure) {
      // "Auth session missing" means the reset link was not followed, or it
      // expired: say that, and where to get another.
      setError(
        failure.message.toLowerCase().includes("session")
          ? "That reset link has expired. Request a new one from the sign-in page."
          : describeAuthError(failure)
      );
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <AuthCard title="Choose a new password" lead="You'll stay signed in once it's saved.">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-password">
            New password
          </label>
          <input
            id="auth-password"
            className="auth-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-confirm">
            New password again
          </label>
          <input
            id="auth-confirm"
            className="auth-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="auth-button" disabled={isBusy}>
          {isBusy ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthCard>
  );
};

export default UpdatePasswordForm;
```

- [ ] **Step 3: Pages**

`ui/src/app/auth/forgot-password/page.tsx`:

```tsx
"use client";

import React from "react";

import ForgotPasswordForm from "../../../components/auth/ForgotPasswordForm";

/** `/auth/forgot-password`. */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
```

`ui/src/app/auth/update-password/page.tsx`:

```tsx
"use client";

import React from "react";

import UpdatePasswordForm from "../../../components/auth/UpdatePasswordForm";

/** `/auth/update-password` — where the reset email's link lands, signed in. */
export default function UpdatePasswordPage() {
  return <UpdatePasswordForm />;
}
```

`ui/src/app/auth/error/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import React from "react";

import AuthCard from "../../../components/auth/AuthCard";

/** `/auth/error` — the confirm route sends a bad or expired link here. */
export default function AuthErrorPage() {
  return (
    <AuthCard
      title="That link didn't work"
      lead="It has expired or was already used. Links are good for one visit."
    >
      <p className="auth-card__lead">
        <Link className="auth-link" href="/auth/forgot-password">
          Request a new reset link
        </Link>
        {" or "}
        <Link className="auth-link" href="/auth/login">
          go back to sign in
        </Link>
        .
      </p>
    </AuthCard>
  );
}
```

- [ ] **Step 4: The confirm route**

`ui/src/app/auth/confirm/route.ts` (server — no `"use client"`):

```ts
/**
 * `/auth/confirm` — where links in auth emails land.
 *
 * Two shapes arrive here. Our recovery template sends `token_hash` + `type`
 * (see the spec's project configuration), which `verifyOtp` turns into a
 * session. Supabase's default templates instead bounce through its hosted
 * verify page and arrive with a PKCE `code`; `exchangeCodeForSession` handles
 * that, so the route still works if a template is reset in the dashboard.
 * Either way the session lands in cookies via lib/supabase/server and the
 * browser is sent on to `next`.
 */

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNext } from "../../../components/auth/nextPath";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/auth/error");
}
```

- [ ] **Step 5: Type check and commit**

```bash
cd ui && npx tsc --noEmit
cd .. && git add ui/src/components/auth ui/src/app/auth
git commit -m "Add password reset, the email-link confirm route, and the error page"
```

---

### Task 9: Navbar account control

**Files:**
- Modify: `ui/src/components/Navbar.tsx:24-28` (imports) and `:64-69` (right side)

- [ ] **Step 1: Imports**

Replace lines 24–28 with:

```tsx
import React from "react";
import MenuIcon from "@mui/icons-material/Menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { config } from "../config/config";
import { useAuth } from "../context/AuthContext";
```

- [ ] **Step 2: Read the session**

After `const pathname = usePathname();` add:

```tsx
  const { status, displayName, signOut } = useAuth();
```

- [ ] **Step 3: Replace the "Welcome!" block**

Replace the `{/* Right side - Welcome message */}` div (the block that prints `Welcome!`) with:

```tsx
        {/* Right side — who is signed in. Renders nothing while the session is
            still being read, so a signed-in visitor never sees "Sign in" flash
            for a frame. Sign-in carries the current path so it comes back. */}
        <div className="flex items-center gap-x-4 px-3 text-[14px]">
          {status === "signed-in" && (
            <>
              <p className="text-[#202020]">{displayName || "Signed in"}</p>
              <button
                type="button"
                className="text-[#666] hover:underline"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          )}
          {status === "signed-out" && (
            <Link
              href={`/auth/login?next=${encodeURIComponent(pathname)}`}
              className="text-[#202020] hover:underline"
            >
              Sign in
            </Link>
          )}
        </div>
```

- [ ] **Step 4: Type check and commit**

```bash
cd ui && npx tsc --noEmit
cd .. && git add ui/src/components/Navbar.tsx
git commit -m "Show the account in the navbar"
```

---

### Task 10: Gate writing on `/community` and sign with the account name

**Files:**
- Modify: `ui/src/components/community/ReviewForm.tsx` — props, state, the "Sign it as" field
- Modify: `ui/src/components/community/ReplyThread.tsx` — props, state, the name input, the form
- Modify: `ui/src/components/community/ReviewCard.tsx` — `canVote` prop
- Modify: `ui/src/components/community/Community.tsx` — `useAuth`, gating, remove `rememberedName`
- Modify: `ui/src/data/reviewStore.ts` — remove `NAME_KEY` and `rememberedName`

- [ ] **Step 1: ReviewForm takes the author, does not ask for it**

In `ReviewForm.tsx`:

Replace the props interface:

```tsx
interface ReviewFormProps {
  /** The signed-in account's display name. The review is signed with it. */
  author: string;
  onSubmit: (draft: ReviewDraft) => Promise<void>;
  onCancel: () => void;
}
```

Remove `author?: string;` from `interface Errors`.

Change the component signature to `({ author, onSubmit, onCancel })` and delete the line `const [author, setAuthor] = useState(initialAuthor);`.

In `validate()`, delete the line `if (author.trim().length < 2) found.author = "Add a name to sign it with.";`.

Delete the whole `<div className="com-field">` block whose label reads *Sign it as* (from `<div className="com-field">` through its closing `</div>` just before `<div className="com-form__actions">`).

Replace the form lead paragraph:

```tsx
        <p className="com-form__lead">
          Say what you wired it to and how it held up. It will be signed{" "}
          <b>{author}</b>. Reviews stay in this browser for now — nothing is
          sent anywhere.
        </p>
```

- [ ] **Step 2: ReplyThread takes the author and a `canWrite` flag**

In `ReplyThread.tsx`:

Add `import Link from "next/link";` after the React import.

Replace the props interface:

```tsx
interface ReplyThreadProps {
  reviewId: string;
  /** The whole thread, oldest first. */
  replies: Reply[];
  /** Ids written from this browser, so they can be taken back. */
  ownIds: Set<string>;
  /** The signed-in account's display name. Replies are signed with it. */
  author: string;
  /** False while signed out: the thread reads, but the box is a sign-in link. */
  canWrite: boolean;
  /** Draft text, held by the page so it survives the thread being closed. */
  draft: string;
  onDraftChange: (reviewId: string, text: string) => void;
  onSubmit: (draft: ReplyDraft) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}
```

Destructure `author, canWrite` in place of `initialAuthor`; delete `const [author, setAuthor] = useState(initialAuthor);` and the `useState` import stays (still used for `error`, `isSaving`).

In `handleSubmit`, delete the block:

```tsx
    if (author.trim().length < 2) {
      setError("Add a name to sign it with.");
      return;
    }
```

and change the submit call to `await onSubmit({ reviewId, body, author });`.

Replace the `<form className="com-replyform" …>` element entirely with:

```tsx
      {canWrite ? (
        <form className="com-replyform" onSubmit={handleSubmit} noValidate>
          <textarea
            ref={boxRef}
            className="com-input com-replyform__box"
            value={draft}
            maxLength={BODY_MAX}
            rows={2}
            placeholder="Add to this thread"
            aria-label="Your reply"
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              onDraftChange(reviewId, event.target.value);
              if (error) setError(null);
            }}
          />

          <div className="com-replyform__foot">
            <p className="com-hint">
              Posting as <b>{author}</b>
            </p>

            <div className="com-replyform__actions">
              {/* Only shown once it could matter, rather than counting from 600
                  the moment the box is empty. */}
              {remaining <= 100 && (
                <span className="com-counter">{remaining} left</span>
              )}
              <button
                type="button"
                className="com-linkbutton com-linkbutton--quiet"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="submit"
                className="com-button com-button--compact"
                disabled={isSaving}
              >
                {isSaving ? "Posting…" : "Post reply"}
              </button>
            </div>
          </div>

          {error && <p className="com-error">{error}</p>}
        </form>
      ) : (
        <div className="com-replyform__foot">
          <p className="com-hint">
            <Link className="com-linkbutton" href="/auth/login?next=/community">
              Sign in to reply
            </Link>
          </p>
          <button
            type="button"
            className="com-linkbutton com-linkbutton--quiet"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      )}
```

The focus effect at the top of the component must not run against a box that is not rendered: change it to

```tsx
  useEffect(() => {
    if (canWrite) boxRef.current?.focus({ preventScroll: true });
  }, [canWrite]);
```

- [ ] **Step 3: ReviewCard gates the helpful button**

In `ReviewCard.tsx`, add to `ReviewCardProps` after `own`:

```tsx
  /** Signed in. Voting is writing, and writing needs an account. */
  canVote: boolean;
```

Destructure `canVote`. Change the helpful button to:

```tsx
            <button
              type="button"
              className={"com-helpful" + (voted ? " com-helpful--on" : "")}
              onClick={() => onHelpful(review.id)}
              disabled={voted || !canVote}
              aria-pressed={voted}
              title={canVote ? undefined : "Sign in to mark reviews helpful"}
            >
```

- [ ] **Step 4: Community.tsx reads the session**

Imports: add `import Link from "next/link";` after the React import and `import { useAuth } from "../../context/AuthContext";` after the reviewStore import. Remove `rememberedName,` from the reviewStore import list.

After the `own` state (`const [own, setOwn] = ...`), add:

```tsx
  /* Writing needs an account; reading does not. While the session is still
     being read the write controls are disabled, not swapped for "Sign in" —
     a signed-in reader should never see that flash. */
  const { status, displayName } = useAuth();
  const canWrite = status === "signed-in";
```

In `handleHelpful`, guard: `if (!canWrite) return;` as the first line.

Delete the comment and line for `savedName` (`const savedName = rememberedName();` and the two comment lines above it).

In the hero's `com-hero__seek` div, replace the `{!isComposing && (<button …>Write a review</button>)}` block with:

```tsx
              {!isComposing &&
                (canWrite ? (
                  <button
                    type="button"
                    className="com-button com-button--compact"
                    onClick={() => setIsComposing(true)}
                  >
                    Write a review
                  </button>
                ) : status === "signed-out" ? (
                  <Link
                    className="com-button com-button--compact"
                    href="/auth/login?next=/community"
                  >
                    Sign in to write a review
                  </Link>
                ) : (
                  <button type="button" className="com-button com-button--compact" disabled>
                    Write a review
                  </button>
                ))}
```

Replace `<ReviewForm initialAuthor={savedName} …` with `<ReviewForm author={displayName} …`.

In the `ReviewCard` props add `canVote={canWrite}` after `own={…}`. In the nested `ReplyThread`, replace `initialAuthor={savedName}` with `author={displayName}` and add `canWrite={canWrite}`.

In the empty state, replace the `Write the first review` button with:

```tsx
                  {canWrite ? (
                    <button
                      type="button"
                      className="com-button"
                      onClick={() => setIsComposing(true)}
                    >
                      Write the first review
                    </button>
                  ) : (
                    <Link className="com-button" href="/auth/login?next=/community">
                      Sign in to write the first review
                    </Link>
                  )}
```

Update the file's header comment: replace the last paragraph (`Storage is …`) with:

```
 * Storage is `localStorage`, behind the async module in data/reviewStore. Every
 * call here is already awaited, so pointing that module at Supabase changes
 * nothing in this file. Identity comes from `useAuth()`: writing needs an
 * account, and the display name is what a review is signed with.
```

- [ ] **Step 5: reviewStore drops the remembered name**

In `reviewStore.ts`: delete `const NAME_KEY = "servo.community.name.v1";`, the two `write(NAME_KEY, draft.author);` lines with their comments, and the `rememberedName` function. In the header comment, replace the final paragraph starting `Two things stay on the device even then` with:

```
 * Two things stay on the device even then, because they are facts about this
 * browser rather than about the review: which reviews this visitor has voted
 * helpful, and which ones they wrote. (The author's name used to be a third;
 * it now comes from the signed-in account.) `helpful` itself becomes an RPC so
 * the count is a server-side increment rather than a read-modify-write that
 * two open tabs can lose.
```

- [ ] **Step 6: Link inside `.com-button`**

`.com-button` is written for `<button>`; a `<Link>` with the class also needs `text-decoration: none; display: inline-block; text-align: center;`. In `ui/src/community.css`, add to the `.com-button` rule after `cursor: pointer;`:

```css
  /* Also worn by a next/link when the action is "go sign in". */
  display: inline-block;
  text-decoration: none;
  text-align: center;
```

- [ ] **Step 7: Type check, lint, commit**

```bash
cd ui && npx tsc --noEmit && npm run lint 2>&1 | grep -E "error|✖" ; echo "lint exit: $?"
```

Expected: tsc clean; lint prints only the pre-existing warnings, no `error`.

```bash
cd .. && git add ui/src/components/community ui/src/data/reviewStore.ts ui/src/community.css
git commit -m "Gate writing on /community behind sign-in and sign with the account name"
```

---

### Task 11: Documentation

**Files:**
- Modify: `CLAUDE.md` — UI route table and "easy to break" list
- Modify: `docs/PAGES.md` — community row

- [ ] **Step 1: CLAUDE.md route table**

After the `/assistant` row, add:

```markdown
| `/auth/login`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/update-password` | `src/app/auth/*/page.tsx` | Accounts — email + password on Supabase Auth. `/auth/confirm` is a route handler that turns an email link into a session |
```

- [ ] **Step 2: CLAUDE.md "easy to break" bullet**

After the `reviewStore.ts` bullet, add:

```markdown
- **Identity is `useAuth()` and nothing else.**
  [ui/src/context/AuthContext.tsx](ui/src/context/AuthContext.tsx) is the only
  file that observes the Supabase session; `ui/src/lib/supabase/*` are the only
  files that read the env variables. Sessions are cookies (`@supabase/ssr`), so
  route handlers can see the user too, and `src/proxy.ts` refreshes the token on
  every request — do not add redirects there; nothing on this site is behind a
  login wall. Reading is public everywhere. Writing on `/community` (post, reply,
  vote, delete) needs an account, and reviews are signed with the account's
  display name from the `profiles` table, which a trigger fills at sign-up. Email
  confirmation is **off** on the project because Supabase's built-in mailer
  allows a few sends an hour; turn it on when real SMTP exists. Settings and the
  schema are in
  [docs/superpowers/specs/2026-09-19-supabase-auth-design.md](docs/superpowers/specs/2026-09-19-supabase-auth-design.md).
```

Also update the `ui/.env` sentence in the *Brand name…* bullet to mention the two Supabase variables: after "falls back to `/api` for the Docker nginx proxy." add "`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` live in the same file."

- [ ] **Step 3: PAGES.md**

In the table row `| 9. Community reviews |`, change the last cell to:

```
Needs no scraped data — the content is written by readers. Writing needs a Supabase account (email + password); reviews are still in `localStorage` behind an async store, and moving them to Supabase is the next spec
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/PAGES.md
git commit -m "Document the auth routes and the identity rule"
```

---

### Task 12: Verify end to end

**Files:** none.

- [ ] **Step 1: Static checks**

```bash
cd ui && npx tsc --noEmit && npm run build 2>&1 | tail -25 && npm run lint 2>&1 | tail -5
```

Expected: tsc silent; build lists every `/auth/*` route and the proxy; lint has warnings only.

- [ ] **Step 2: Start the servers**

```bash
cd mock-server && node server.js   # background
cd ui && npm start                  # background, port 3000
```

- [ ] **Step 3: Walk the flows in a browser** (chrome-devtools MCP or by hand)

1. `/community` signed out → hero shows **Sign in to write a review**; navbar shows **Sign in**.
2. Click it → `/auth/login?next=/community`. Click **Sign up** → `/auth/sign-up?next=/community`.
3. Submit with name `Bench Tester`, a fresh email, password `robots-2026`. Expected: lands on `/community`, navbar shows **Bench Tester**, hero shows **Write a review**.
4. Write a review. The lead says *It will be signed Bench Tester*; there is no name box; the card byline reads **Bench Tester**.
5. Open the thread → the reply box says *Posting as Bench Tester*. Post a reply.
6. **Sign out** in the navbar → composer becomes the sign-in link; open thread shows **Sign in to reply**; **Helpful** is disabled with the hint.
7. Sign in again with the same pair. Wrong password first → *That email and password don't match…*.
8. `/auth/forgot-password` → submit → *If that address has an account…*. (Inbox check is manual; the route is exercised by step 9.)
9. `GET /auth/confirm?token_hash=bad&type=recovery` → redirects to `/auth/error` with the two links.
10. Browser console: no errors on any of the pages above.

- [ ] **Step 4: Database check**

```bash
curl -s -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  https://api.supabase.com/v1/projects/gqhkibhaaomeffaxzkio/database/query \
  -d '{"query":"select p.display_name, u.email from public.profiles p join auth.users u on u.id = p.id"}'
```

Expected: one row, `Bench Tester` with the email used in step 3.

- [ ] **Step 5: Advisors**

```bash
curl -s -H "Authorization: Bearer $PAT" "https://api.supabase.com/v1/projects/gqhkibhaaomeffaxzkio/advisors/security" | python -c "import sys,json;d=json.load(sys.stdin);print([l['title'] for l in d.get('lints',[])])"
```

Expected: no lint naming `profiles` (a `function_search_path_mutable` for `handle_new_user` should not appear because `set search_path` is declared).

- [ ] **Step 6: Final commit if anything moved**

```bash
git status --short
```

Expected: clean. If the walk-through forced a fix, commit it with a message naming what it fixed.
