# Supabase authentication — design

**Date:** 2026-09-19
**Status:** approved, ready for a plan
**Supersedes nothing. Prerequisite for:**
[2026-09-19-community-supabase-design.md](2026-09-19-community-supabase-design.md),
which moved community reviews out of `localStorage`.

## Why

Community reviews live in the browser that wrote them. Moving them to a shared
database is the point of the Supabase project, but a shared table needs an
answer to "who may delete this row" — and the current answer, *whoever wrote it
from this browser*, means nothing once rows leave the browser. So identity comes
first. This spec adds accounts; the next one moves the reviews.

## Decisions

| Question | Decision |
|---|---|
| Identity | Supabase Auth, email + password. No OAuth, no magic links. |
| Session | `@supabase/ssr` cookie sessions, refreshed by `src/proxy.ts` (Next 16's name for middleware). Pages stay `"use client"`. |
| Gating | Writing only. Catalogue, tutorials, assistant and *reading* reviews stay public. Posting, replying, voting helpful and deleting need an account. |
| Author name | A display name given once at sign-up, stored in `public.profiles`. The per-review name box goes. |
| Email confirmation | Off for now (`mailer_autoconfirm`), because Supabase's built-in mailer is capped at a few sends an hour and a demo cannot depend on it. Turn it on with real SMTP. |
| Template | `npx create-next-app --example with-supabase` is the pattern (file layout, cookie helpers, page set), not a scaffold — the UI is already a Next 16 app. No template CSS is copied. |

Why cookies and not a browser-only client: the assistant route
(`src/app/api/query/stream`) runs on the server and will need to know the user
for chat memory. A `localStorage` session is invisible to it, and it also
renders every statically prerendered page logged-out for one frame before
hydration. Cookies are readable on both sides and cost two small files.

## Database

One table, one trigger, RLS on.

```sql
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone may read a name: it is printed on every review.
create policy "profiles are public"        on public.profiles for select using (true);
-- Only the owner may change theirs. No insert policy: the trigger below does
-- it as the definer, so a client cannot create a profile for someone else.
create policy "owners update their profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Sign-up passes `display_name` in user metadata; this copies it across so the
-- app never has to do a second write after `signUp` (which can fail halfway).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Someone'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Security definer, so nothing may call it except the trigger. Without this
-- the security advisor flags it as executable by anon.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

No delete policy: deleting the auth user cascades. Applied as two named
migrations (`profiles`, `lock_handle_new_user`) through the Management API so
`supabase_migrations.schema_migrations` records them.

## Project configuration (Management API)

Set once, recorded here so they can be re-applied:

| Setting | Value | Why |
|---|---|---|
| `mailer_autoconfirm` | `true` | See *Decisions*. |
| `password_min_length` | `8` | The client validates the same number. |
| `site_url` | `http://localhost:3000` | Where auth emails link back to. |
| `uri_allow_list` | `http://localhost:3000/**` | Password-reset redirects must be allow-listed or Supabase ignores `redirectTo`. Add the Vercel URL when there is one. |

Email templates cannot be changed on the free tier with the default mailer
(the API refuses with "Email template modification is not available"), so the
recovery email keeps Supabase's default link. That link bounces through
Supabase's hosted verify page and lands on `/auth/confirm?code=…`; the route
handles that with `exchangeCodeForSession`, and also accepts `token_hash` +
`type` for the day the template can point here directly.

## Files

```
ui/
  .env.example              + NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  src/proxy.ts              Next 16 proxy: calls updateSession on every non-static request
  src/lib/supabase/
    client.ts               createBrowserClient — the one the pages use
    server.ts               createServerClient over next/headers cookies — route handlers
    proxy.ts                updateSession(): refresh the token, write cookies back
  src/context/AuthContext.tsx
                            AuthProvider + useAuth(): { status, user, profile, signOut }
                            status: "loading" | "signed-out" | "signed-in"
  src/app/providers.tsx     wraps children in AuthProvider
  src/components/Navbar.tsx right side: "Sign in" link, or display name + "Sign out"
  src/auth.css              tokens + the centred card the auth pages share
  src/components/auth/
    AuthCard.tsx            shell: title, lead, children, footer link
    LoginForm.tsx
    SignUpForm.tsx
    ForgotPasswordForm.tsx
    UpdatePasswordForm.tsx
  src/app/auth/
    login/page.tsx
    sign-up/page.tsx
    forgot-password/page.tsx
    update-password/page.tsx
    error/page.tsx          "That link has expired or was already used" + a way back
    confirm/route.ts        GET ?token_hash&type&next → verifyOtp → redirect(next) or /auth/error
  src/components/community/
    Community.tsx           reads useAuth(); passes author from profile; gates actions
    ReviewForm.tsx          name field removed; `author` comes from the caller
    ReplyThread.tsx         same
```

`AuthContext` is the only file that knows how a session is observed
(`onAuthStateChange`), and `lib/supabase/*` are the only files that know the
env variable names. Everything else asks `useAuth()`.

## Flows

**Sign up.** Display name, email, password, confirm password. Client checks:
name 2–40 chars, valid email, password ≥ 8, passwords match. Calls
`signUp({ email, password, options: { data: { display_name } } })`. With
autoconfirm on, the response carries a session; the trigger has created the
profile; the page routes to `/assistant` regardless of `?next=` (a new member's
first screen is the assistant; `?next=` is only forwarded to the sign-in link).
If confirmation is later turned on, `session` is null and the same page shows
"Check your inbox" — no second page needed.

Password fields on every auth form are `PasswordInput`: uncontrolled, read from
the DOM at submit, with a show/hide eye. Uncontrolled because a password
manager's "Use suggested password" writes to the node directly, and a controlled
input whose state never saw that write is reset to empty on the next render.

**Log in.** Email, password → `signInWithPassword`. A wrong pair shows Supabase's
message reworded to say what to do ("That email and password don't match. Try
again, or reset your password."). Success routes to `?next=` or `/`.

**Forgot password.** Email → `resetPasswordForEmail(email, { redirectTo:
origin + "/auth/confirm?next=/auth/update-password" })`. Always shows "If that
address has an account, a reset link is on its way" — it must not reveal which
emails exist.

**Reset.** The email link hits `/auth/confirm` with a `code` (or a
`token_hash` + `type`, see above), which becomes a session and redirects to
`/auth/update-password`, now signed in. That page takes a new password twice
and calls `updateUser`.

**Sign out.** `signOut()` from the navbar; the context flips to `signed-out`;
the current page stays.

**Gating on `/community`.** While `status === "loading"` the write controls
render disabled, so a signed-in reader never sees "Sign in" flash. Signed out:
the "Write a review" button becomes a link "Sign in to write a review" →
`/auth/login?next=/community`; the reply box in an open thread is replaced by
the same link; the helpful button is disabled with that link as its hint. Signed
in: the forms render with no name box, and `author` is the profile's display
name. Delete stays on the device-local `isOwn` rule until the next spec moves
ownership to RLS.

## Design

Auth pages use the community page's tokens (redeclared in `auth.css`, per the
"no shared page CSS" rule): NVIDIA Sans, ink/slate/muted, `#D8D8D8` field
border, green focus ring, 10px input radius, 14px input text. One centred card,
max-width 400px, on the `#F9F9F9` panel ground, title 20px/700, lead 13.5px
slate. Buttons are `.com-button`'s values. Sentence case; every error says what
to do next (DESIGN.md §8). No page-header band — the card *is* the page.

## Errors

- Supabase unreachable / env missing: forms show "Couldn't reach the sign-in
  service. Check your connection and try again." `AuthProvider` settles to
  `signed-out` rather than hanging in `loading`.
- Duplicate email on sign-up: "There's already an account for that email. Sign
  in instead?" with the link.
- Expired reset link: `/auth/error` with a link to request a new one.
- Missing env in `client.ts`: throw at construction with the variable name, so
  the failure is one obvious line in the console, not a 401 three screens later.

## Testing

No UI test harness exists; the bar is `npx tsc --noEmit`, `npm run build`,
`npm run lint` clean, plus a walk through every flow in a browser (sign up →
navbar shows name → post a review signed with it → sign out → composer gates →
sign in → forgot password → reset). Database side: after one sign-up, `select
display_name from profiles` returns the name; `list_advisors` shows no RLS
warning on `profiles`.

## Out of scope

Moving reviews to Supabase (next spec). Google OAuth. Email confirmation.
Editing a display name. Deleting an account. Rate limiting beyond Supabase's
defaults.
