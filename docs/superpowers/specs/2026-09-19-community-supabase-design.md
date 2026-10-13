# Community reviews in Supabase — design

**Date:** 2026-09-19
**Status:** approved, implemented
**Follows:** [2026-09-19-supabase-auth-design.md](2026-09-19-supabase-auth-design.md),
which added the accounts this spec needs.

## Why

Reviews and replies on `/community` live in the browser that wrote them. Nobody
else can read them, which defeats the page. The auth spec gave every writer an
account; this one moves the rows to the Supabase project so a review posted in
one browser is visible in every other, and so "may I delete this" is answered
by the database (`author_id = auth.uid()`) rather than by a list of ids in
`localStorage`.

`reviewStore.ts` was written as the seam for this: every function is already
`async`, so the page's data flow does not change shape. What does change is the
two device-local facts. "Voted helpful" and "written here" were properties of a
browser because there was nothing else to pin them to; with accounts they are
properties of a user, and they move to the database with everything else.

## Decisions

| Question | Decision |
|---|---|
| Where | The RobotEShop Supabase project (`gqhkibhaaomeffaxzkio`), next to `profiles`. Applied as named migrations `community_reviews`, `review_votes_default_user` and `community_reviews_perf`, recorded in `supabase_migrations.schema_migrations` like the auth ones. |
| Author name | Snapshotted into the row by a `before insert` trigger from `profiles.display_name`. The client never sends `author` or `author_id`; it cannot sign a review as someone else. |
| Helpful count | A `review_votes` table keyed `(review_id, user_id)`, so one vote per account, and a `security definer` trigger that maintains `reviews.helpful`. No RPC and no read-modify-write. |
| Ownership | `author_id = auth.uid()`, enforced by RLS on delete. The UI computes `own` the same way. The `servo.community.authored.v1` and `voted.v1` keys go. |
| Existing localStorage reviews | Not migrated. They were device-local and written against a schema with no author id; the page starts clean. The old keys are left where they are and nothing reads them. |
| Editing | Not offered. No update policy on either table. |
| Account deletion | Cascades through `profiles` to reviews, replies and votes. Deleting an account is out of scope for the UI, but the schema should not strand rows when it arrives. |
| Realtime | No. The page re-fetches after its own writes, which is what it did before. |
| Loading state | The hero's one-line "Loading reviews…" stays. The fetch-cache spec kept community off the skeleton list because reads were instant; they are now a network round trip, but the page is a feed with a filter rail, and one honest line beats a skeleton that guesses at the shape of the first review. Revisit when there are enough reviews for the wait to be noticeable. |

## Database

```sql
create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  author_id       uuid not null references public.profiles (id) on delete cascade,
  author          text not null,
  rating          smallint not null check (rating between 1 and 5),
  title           text not null check (char_length(title) between 4 and 90),
  body            text not null check (char_length(body) between 40 and 2000),
  board           text not null default '' check (char_length(board) <= 40),
  months_used     smallint check (months_used is null or months_used >= 0),
  arrived_working boolean,
  helpful         integer not null default 0,
  product         jsonb not null
);
create index reviews_created_at on public.reviews (created_at desc);

create table public.review_replies (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews (id) on delete cascade,
  created_at timestamptz not null default now(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  author     text not null,
  body       text not null check (char_length(body) between 2 and 600)
);
create index review_replies_thread on public.review_replies (review_id, created_at);

create table public.review_votes (
  review_id  uuid not null references public.reviews (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
```

`user_id` defaults to `auth.uid()` so a vote is `insert { review_id }` and the
client never names itself. (Applied as a second migration,
`review_votes_default_user`, because the first one shipped without it.)

The check constraints repeat the form's limits (`ReviewForm.tsx`,
`ReplyThread.tsx`) so a client that skips the form still cannot insert an empty
title. `months_used` is nullable because "not stated" is a distinct answer
(`types/community.ts`). `product` is the `TaggedProduct` JSON, denormalised on
purpose: catalogue ids do not survive a re-crawl.

### Triggers

```sql
-- Stamp the author from the session. Runs as the caller; reading profiles is
-- allowed to everyone, and auth.uid() is the caller's own id.
create function public.stamp_review_author() returns trigger
language plpgsql set search_path = public as $$
begin
  new.author_id := auth.uid();
  select display_name into new.author from public.profiles where id = new.author_id;
  if new.author is null then
    raise exception 'no profile for the signed-in user';
  end if;
  return new;
end $$;

create trigger reviews_stamp_author before insert on public.reviews
  for each row execute function public.stamp_review_author();
create trigger review_replies_stamp_author before insert on public.review_replies
  for each row execute function public.stamp_review_author();

-- Keep reviews.helpful equal to the number of vote rows. Definer, because the
-- voter has no update policy on reviews and must not need one.
create function public.count_review_vote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.reviews set helpful = helpful + 1 where id = new.review_id;
    return new;
  else
    update public.reviews set helpful = greatest(helpful - 1, 0) where id = old.review_id;
    return old;
  end if;
end $$;

create trigger review_votes_count after insert or delete on public.review_votes
  for each row execute function public.count_review_vote();

revoke execute on function public.stamp_review_author() from public, anon, authenticated;
revoke execute on function public.count_review_vote()  from public, anon, authenticated;
```

RLS `with check` runs after `before` triggers, so the insert policies below see
the stamped `author_id`. The `stamp` trigger overwrites whatever the client
sent, which is the whole point.

### Policies

```sql
alter table public.reviews        enable row level security;
alter table public.review_replies enable row level security;
alter table public.review_votes   enable row level security;

create policy "reviews are public"        on public.reviews for select using (true);
create policy "members write reviews"     on public.reviews for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "authors delete reviews"    on public.reviews for delete to authenticated
  using (author_id = (select auth.uid()));

create policy "replies are public"        on public.review_replies for select using (true);
create policy "members write replies"     on public.review_replies for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "authors delete replies"    on public.review_replies for delete to authenticated
  using (author_id = (select auth.uid()));

create policy "voters see their votes"    on public.review_votes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "members vote once"         on public.review_votes for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Covering indexes for the profile foreign keys.
create index reviews_author        on public.reviews        (author_id);
create index review_replies_author on public.review_replies (author_id);
create index review_votes_user     on public.review_votes   (user_id);
```

No update policies anywhere: nothing is editable. No delete policy on votes: the
UI does not offer un-voting, and the primary key already stops a second vote.
Votes are not publicly readable; the count on the review is, and that is all a
reader needs.

`(select auth.uid())` rather than `auth.uid()` is the form Supabase's
performance advisor asks for: it is evaluated once per statement instead of
once per row. The three `author_id` indexes are the advisor's other request;
without them deleting a profile scans all three tables. Both landed as a third
migration, `community_reviews_perf`, after the advisor was run on the first.

## UI

### `types/community.ts`

- `ReviewDraft` and `ReplyDraft` lose `author`. The database signs the row.
- `Review` and `Reply` gain `authorId: string`.

### `data/reviewStore.ts`

Rewritten against `createClient()` from `lib/supabase/client`. Same exported
names where the meaning survived, two changes where it did not:

| Before | After | Why |
|---|---|---|
| `listReviews()` | same, `select * order by created_at desc` | |
| `addReview(draft)` | same; inserts `{ rating, title, body, board, months_used, arrived_working, product }` and returns the row | `author`/`author_id` come from the trigger |
| `voteHelpful(id)` | same signature; `insert into review_votes { review_id }` then `listReviews()` | a duplicate-key error (already voted) is swallowed |
| `removeReview(id)` | same; `delete where id` then `listReviews()` | the cascade drops the thread |
| `listReplies()` | same; `select * order by created_at` grouped into `ReplyIndex` | |
| `addReply(draft)` / `removeReply(id)` | same | |
| `hasVoted(id)` | **replaced by** `listMyVotes(): Promise<Set<string>>` | votes are per account and live on the server; fetched once per load, not once per card |
| `isOwn(id)` | **removed** | the page compares `authorId` with `user.id` |

Rows are mapped snake_case to camelCase in one `toReview` / `toReply` each.
Every write throws on a Supabase error, with the message reworded to say what
to do; the page catches and shows it. The store does not know about toasts.

### `components/community/Community.tsx`

- `own` is derived, not snapshotted: `review.authorId === user?.id`.
- `voted` comes from `listMyVotes()` in the load effect when signed in, and is
  cleared on sign-out. Voting adds the id locally as well as re-fetching, so the
  button flips at once.
- Each write handler wraps the store call in `try/catch` and raises
  `toast.error(message)` on failure. The composer stays open so the text is not
  lost.
- The hero line "Reading your saved reviews…" becomes "Loading reviews…", and
  the note "Reviews and replies live in this browser only" becomes
  "Every review is signed by an account and visible to everyone who reads this
  page."
- If the initial fetch fails, the hero line says "Couldn't load reviews. Check
  your connection and reload." and the feed stays empty rather than showing the
  "No reviews yet" invitation, which would be a lie.

### `components/community/ReviewForm.tsx`, `ReplyThread.tsx`

Drop `author` from the submitted draft. The "Posting as **name**" hint stays;
`author` remains a display prop. The lead sentence loses "Reviews stay in this
browser for now — nothing is sent anywhere."

## Errors

| Case | What the reader sees |
|---|---|
| Insert fails (network, RLS, session expired mid-write) | Toast: "Couldn't post your review. Check your connection and try again." The form keeps its text. |
| Vote fails | Toast: "Couldn't save your vote. Try again in a moment." Duplicate key is not an error: the button just reads "Marked helpful". |
| Delete fails | Toast: "Couldn't delete that. Try again in a moment." |
| Initial load fails | Hero: "Couldn't load reviews. Check your connection and reload." No "No reviews yet" empty state. |
| Signed out while composing | The insert is refused by RLS; same toast as an insert failure. The next load flips the controls. |

## Testing

No UI harness. The bar is `npx tsc --noEmit`, `npm run build`, `npm run lint`
clean, and a browser walk: sign in as the test account → post a review → it
appears with the account's name → open a second browser (or a private window)
signed out → the review is visible, the helpful button is disabled → sign in as
a second account → vote helpful → count is 1 in both browsers after reload →
reply → delete own reply → cannot see a delete button on the other account's
review. Database side: `select author, helpful from reviews` shows the
trigger-stamped name and the trigger-maintained count; the security advisor
reports no RLS finding on the three tables.

## Out of scope

Editing reviews. Un-voting. Migrating localStorage reviews. Realtime. Reviews on
a product detail page and a rating sort in the catalogue (both listed in
`docs/PAGES.md` as the next cheap steps now the rows are shared).
