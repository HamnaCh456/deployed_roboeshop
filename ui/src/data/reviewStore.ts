/**
 * Where community reviews live.
 *
 * This module is the only file that knows reviews are rows in Supabase. The
 * tables, triggers and policies are in
 * docs/superpowers/specs/2026-09-19-community-supabase-design.md; the short
 * version is three tables (`reviews`, `review_replies`, `review_votes`), all
 * readable by anyone and writable only by a signed-in account.
 *
 * Two things the client deliberately does NOT send:
 *
 *   author / author_id   A `before insert` trigger stamps both from the
 *                        session and the profile row, so a review cannot be
 *                        signed with a name the account does not own.
 *   helpful              A trigger on `review_votes` keeps the count. Voting is
 *                        one insert, and the primary key `(review_id, user_id)`
 *                        is what makes it one vote per account.
 *
 * "Yours" is `authorId === user.id`, decided by the page; the database enforces
 * the same rule on delete. Nothing here reads `localStorage` any more. The
 * old `servo.community.*` keys are left where they are and nothing reads them:
 * they held device-local test data from before there were accounts.
 *
 * Every write throws on failure with a sentence the page can show as is. The
 * page decides how (a toast); this file does not know toasts exist.
 */

import { createClient } from "../lib/supabase/client";
import {
  Reply,
  ReplyDraft,
  ReplyIndex,
  Review,
  ReviewDraft,
  TaggedProduct,
} from "../types/community";

/* The row shapes, spelled the way Postgres spells them. Mapped to the camelCase
   types at the boundary so nothing outside this file sees a snake_case field. */

interface ReviewRow {
  id: string;
  created_at: string;
  author_id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  board: string;
  months_used: number | null;
  arrived_working: boolean | null;
  helpful: number;
  product: TaggedProduct;
}

interface ReplyRow {
  id: string;
  review_id: string;
  created_at: string;
  author_id: string;
  author: string;
  body: string;
}

const REVIEW_COLUMNS =
  "id, created_at, author_id, author, rating, title, body, board, months_used, arrived_working, helpful, product";
const REPLY_COLUMNS = "id, review_id, created_at, author_id, author, body";

const toReview = (row: ReviewRow): Review => ({
  id: row.id,
  createdAt: row.created_at,
  authorId: row.author_id,
  author: row.author,
  rating: row.rating,
  title: row.title,
  body: row.body,
  board: row.board,
  monthsUsed: row.months_used,
  arrivedWorking: row.arrived_working,
  helpful: row.helpful,
  product: row.product,
});

const toReply = (row: ReplyRow): Reply => ({
  id: row.id,
  reviewId: row.review_id,
  createdAt: row.created_at,
  authorId: row.author_id,
  author: row.author,
  body: row.body,
});

/** Postgres's code for a unique-constraint violation. */
const DUPLICATE_KEY = "23505";

/**
 * Turn a Supabase error into the one line the reader sees. The raw message
 * ("new row violates row-level security policy") is accurate and useless; what
 * the reader needs is what to do next (DESIGN.md §8).
 */
function fail(what: string, error: { message: string } | null): never {
  console.error(`[reviewStore] ${what}:`, error?.message);
  throw new Error(what);
}

/** Newest first, which is the order every caller wants as its starting point. */
export async function listReviews(): Promise<Review[]> {
  const { data, error } = await createClient()
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) fail("Couldn't load reviews. Check your connection and reload.", error);
  return ((data ?? []) as unknown as ReviewRow[]).map(toReview);
}

export async function addReview(draft: ReviewDraft): Promise<Review> {
  const { data, error } = await createClient()
    .from("reviews")
    .insert({
      rating: draft.rating,
      title: draft.title,
      body: draft.body,
      board: draft.board,
      months_used: draft.monthsUsed,
      arrived_working: draft.arrivedWorking,
      product: draft.product,
    })
    .select(REVIEW_COLUMNS)
    .single();
  if (error || !data) {
    fail("Couldn't post your review. Check your connection and try again.", error);
  }
  return toReview(data as unknown as ReviewRow);
}

/**
 * One vote per review per account. Returns the whole list because the caller
 * renders a list; the count it wants is the one the trigger just wrote.
 *
 * A duplicate key is not a failure: it means this account already voted, and
 * the page should simply show that.
 */
export async function voteHelpful(id: string): Promise<Review[]> {
  const { error } = await createClient()
    .from("review_votes")
    .insert({ review_id: id });
  if (error && error.code !== DUPLICATE_KEY) {
    fail("Couldn't save your vote. Try again in a moment.", error);
  }
  return listReviews();
}

/**
 * Only the author's own rows get through: the delete policy is
 * `author_id = auth.uid()`. Anyone else's delete is silently zero rows, which
 * the re-fetch makes visible.
 */
export async function removeReview(id: string): Promise<Review[]> {
  const { error } = await createClient().from("reviews").delete().eq("id", id);
  if (error) fail("Couldn't delete that. Try again in a moment.", error);
  // The thread and the votes go with it: `on delete cascade`.
  return listReviews();
}

/* REPLIES
   =======
   Stored flat, grouped on the way out. Grouping here rather than in the page
   means the feed asks for every thread in one request, not one per card. The
   whole table is fetched; at this size that is the cheapest correct thing, and
   the day it is not, this is the one function that pages. */

/** Every thread, keyed by review id, oldest first: a conversation reads down. */
export async function listReplies(): Promise<ReplyIndex> {
  const { data, error } = await createClient()
    .from("review_replies")
    .select(REPLY_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) fail("Couldn't load replies. Check your connection and reload.", error);

  const index: ReplyIndex = {};
  ((data ?? []) as unknown as ReplyRow[]).map(toReply).forEach((reply) => {
    if (!index[reply.reviewId]) index[reply.reviewId] = [];
    index[reply.reviewId].push(reply);
  });
  return index;
}

export async function addReply(draft: ReplyDraft): Promise<ReplyIndex> {
  const { error } = await createClient()
    .from("review_replies")
    .insert({ review_id: draft.reviewId, body: draft.body });
  if (error) fail("Couldn't post your reply. Check your connection and try again.", error);
  return listReplies();
}

export async function removeReply(id: string): Promise<ReplyIndex> {
  const { error } = await createClient()
    .from("review_replies")
    .delete()
    .eq("id", id);
  if (error) fail("Couldn't delete that. Try again in a moment.", error);
  return listReplies();
}

/* VOTES
   =====
   Which reviews the signed-in account has marked helpful. The select policy
   only returns the caller's own rows, so no filter is needed; signed out it
   returns nothing, which is also right. Fetched once per load, not once per
   card. */

export async function listMyVotes(): Promise<Set<string>> {
  const { data, error } = await createClient()
    .from("review_votes")
    .select("review_id");
  if (error) {
    // Not worth failing the page over: the worst case is a "Helpful" button
    // that should have read "Marked helpful", and the server refuses the
    // second vote anyway.
    console.error("[reviewStore] Couldn't load votes:", error.message);
    return new Set();
  }
  return new Set(
    ((data ?? []) as unknown as { review_id: string }[]).map((row) => row.review_id)
  );
}
