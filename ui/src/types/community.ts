/**
 * Community reviews.
 *
 * A review here is a bench report, not a star rating. The fields past `body`
 * are the ones that actually decide a purchase in this market and that no
 * general marketplace carries:
 *
 *   board           A 5V sensor on a 3.3V ESP32 is a different product from
 *                   the same sensor on an UNO. "It works" is meaningless
 *                   without saying what it was wired to.
 *   monthsUsed      A verdict written after two days is not the same fact as
 *                   one written after six months of a robot running.
 *   arrivedWorking  Dead-on-arrival parts are the single most common complaint
 *                   about local electronics retail. Tri-state on purpose —
 *                   `null` means the reviewer did not say, and is not the same
 *                   claim as `false`.
 *
 * Every one of those is optional. A review that only carries a rating and a
 * paragraph is still a review, and the card drops the lines it has no value
 * for rather than printing an empty label (DESIGN.md §5).
 */

/**
 * The catalogue product a review is attached to.
 *
 * Denormalised on purpose. The catalogue is rebuilt by every crawl and product
 * ids are not stable across rebuilds, so a review that stored only an id would
 * lose its subject the first time the scraper ran. Storing the name and photo
 * alongside means the review still reads correctly after a re-crawl; `id` is
 * then a best-effort link back rather than the only thread holding it on.
 */
export interface TaggedProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  image: string;
  /** Price at the moment of tagging. A review is a snapshot, not a live quote. */
  price: number;
  currency: string;
  offerCount: number;
  sourceUrl: string;
  /** Platforms the seller's listing claims. Seeds the board suggestions. */
  platforms: string[];
}

/**
 * What the composer collects. The database adds the rest: id, timestamp, vote
 * count, and the author. There is no `author` here on purpose. The row is
 * signed by a trigger from the signed-in account's profile, so the client
 * cannot post under someone else's name however the form is driven.
 */
export interface ReviewDraft {
  product: TaggedProduct;
  /** 1–5. */
  rating: number;
  title: string;
  body: string;
  /** Board it was tested with. Empty string when the reviewer did not say. */
  board: string;
  /** Months in use, or null when not stated. */
  monthsUsed: number | null;
  /** null = did not say, true = worked out of the box, false = arrived dead. */
  arrivedWorking: boolean | null;
}

export interface Review extends ReviewDraft {
  id: string;
  /** ISO 8601, UTC. */
  createdAt: string;
  helpful: number;
  /** The account that wrote it. "Yours" means this equals the session's id. */
  authorId: string;
  /** Display name at the time of posting. */
  author: string;
}

/**
 * A reply to a review.
 *
 * One review has one thread and the thread is flat. Replies do not nest,
 * because a nested tree turns one discussion of one part into several parallel
 * ones and the answer you need ends up three levels down a branch nobody
 * expanded. Answering a specific person is an `@name` inside the body — the
 * same convention every comment thread that stayed readable settled on.
 *
 * `reviewId` is the whole of the threading model. There is no `parentId` on
 * purpose: adding one is what would make a second thread possible.
 */
export interface ReplyDraft {
  reviewId: string;
  body: string;
}

export interface Reply extends ReplyDraft {
  id: string;
  /** ISO 8601, UTC. */
  createdAt: string;
  authorId: string;
  author: string;
}

/** Replies grouped by the review they hang off, oldest first within a thread. */
export type ReplyIndex = Record<string, Reply[]>;

export type ReviewSort = "newest" | "helpful" | "rating-desc" | "rating-asc";
