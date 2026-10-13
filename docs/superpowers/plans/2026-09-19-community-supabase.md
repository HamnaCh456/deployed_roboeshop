# Community reviews in Supabase — implementation plan

Spec: [2026-09-19-community-supabase-design.md](../specs/2026-09-19-community-supabase-design.md).
Pre-approved by the user ("make a plan, auto approve and implement").

## Order

The database first, because nothing in the UI can be checked without it. Then
the types, because both the store and the components depend on them. Then the
store, then the components, then the docs.

## Tasks

- [x] **1. Migration `community_reviews`** on project `gqhkibhaaomeffaxzkio`
      via the Management API (`/database/query`), recorded in
      `supabase_migrations.schema_migrations` by inserting the version row the
      way the two existing migrations were. Contents: the three tables, two
      trigger functions, three triggers, RLS and policies, the two revokes,
      exactly as the spec's SQL. Verify: `\d`-equivalent query lists the
      tables; a `set role authenticated` + `request.jwt.claims` insert stamps
      `author` from the test account's profile; a second vote from the same
      user fails on the primary key; `helpful` reads 1.
- [x] **2. `ui/src/types/community.ts`**: drop `author` from `ReviewDraft` and
      `ReplyDraft`; add `authorId` and `author` to `Review` and `Reply`.
- [x] **3. `ui/src/data/reviewStore.ts`**: rewrite per the spec's table.
      Header comment rewritten to describe what it now is (the only file that
      knows reviews are Supabase rows) rather than what it was about to become.
- [x] **4. `ReviewForm.tsx`, `ReplyThread.tsx`**: stop sending `author`; fix
      the lead copy.
- [x] **5. `Community.tsx`**: `own` derived from `authorId`; `voted` from
      `listMyVotes()`; `try/catch` + `toast.error` on every write; hero copy;
      load-failure state.
- [x] **6. Checks**: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [x] **7. Docs**: `CLAUDE.md` reviewStore bullet, `docs/PAGES.md` row 9 and
      the "Storage is the seam" paragraph, the auth spec's "Prerequisite for"
      line, the memory file's "next spec" note.
- [x] **8. Browser walk** per the spec's Testing section, as far as the
      environment allows (the dev servers are the user's; read `.next/dev/logs`
      rather than starting a second one).
