/**
 * Community — reviews written by people who actually wired the part up.
 *
 * Structure, and why:
 *
 *   Hero      The claim, then coverage as one sentence, then the way in. The
 *             dead-on-arrival rate sits here because it is the fact this page
 *             exists to surface and no competitor publishes it.
 *   Composer  Inline rather than a modal or a route: the feed stays visible
 *             while you write, which is where the house style for a review is.
 *   Rail+feed Faceted browse, matching the tutorials page — once a part has
 *             twenty reviews, "show me the 2-star ones on ESP32" is the only
 *             useful way to read them.
 *   Threads   One review, one flat discussion, and only one of them open at a
 *             time. This page owns `openThread` for that reason, and owns the
 *             unsent drafts too so closing a thread never eats what was typed.
 *
 * Storage is Supabase, behind the async module in data/reviewStore; this file
 * never sees a table name. Identity comes from `useAuth()`: writing needs an
 * account, the database signs each row from the session, and "yours" means
 * the row's `authorId` is the session's user id. Writes can fail now that they
 * cross a network, so every one is caught and reported as a toast that says
 * what to do; the text being written is never thrown away on failure.
 */

"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import {
  ReplyDraft,
  ReplyIndex,
  Review,
  ReviewDraft,
  ReviewSort,
} from "../../types/community";
import {
  addReply,
  addReview,
  listMyVotes,
  listReplies,
  listReviews,
  removeReply,
  removeReview,
  voteHelpful,
} from "../../data/reviewStore";
import { useAuth } from "../../context/AuthContext";
import CommunityRail, { RailGroup } from "./CommunityRail";
import ReplyThread from "./ReplyThread";
import ReviewCard from "./ReviewCard";
import ReviewForm from "./ReviewForm";
import { meanRating } from "./format";
import "../../community.css";

/** How each filter group reads its values off a review. */
const FACETS: {
  key: string;
  legend: string;
  values: (review: Review) => string[];
  label?: (value: string) => string;
  /** Fixed display order where the values are a scale rather than a set. */
  order?: string[];
}[] = [
  {
    key: "rating",
    legend: "Score",
    values: (review) => [String(review.rating)],
    label: (value) => `${value} out of 5`,
    order: ["5", "4", "3", "2", "1"],
  },
  {
    key: "board",
    legend: "Tested on",
    values: (review) => (review.board ? [review.board] : []),
  },
  {
    key: "arrival",
    legend: "On arrival",
    values: (review) =>
      review.arrivedWorking === null
        ? []
        : [review.arrivedWorking ? "Worked out of the box" : "Arrived dead"],
    order: ["Worked out of the box", "Arrived dead"],
  },
];

const EMPTY_SELECTION: Record<string, string[]> = {};
const NO_VOTES: Set<string> = new Set();

/** Free text runs over everything someone might half-remember. */
const searchable = (review: Review): string =>
  [
    review.title,
    review.body,
    review.author,
    review.board,
    review.product.name,
    review.product.brand,
    review.product.category,
  ]
    .join(" ")
    .toLowerCase();

const Community: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isComposing, setIsComposing] = useState(false);

  const [selected, setSelected] =
    useState<Record<string, string[]>>(EMPTY_SELECTION);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReviewSort>("newest");

  /* Discussion. At most one thread is open, so a reader is never looking at
     three half-written boxes wondering which one they were in. */
  const [replies, setReplies] = useState<ReplyIndex>({});
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  /* Which reviews this account has marked helpful. Fetched once per account,
     not read inside every card's render. The set remembers whose it is, so
     signing out (or switching accounts) shows no votes without a write to
     state: the stale set simply stops matching. */
  const [votes, setVotes] = useState<{ owner: string | null; ids: Set<string> }>(
    { owner: null, ids: new Set() }
  );

  /* The first fetch failing is a different state from "no reviews yet": the
     hero has to say so, and the empty state must not invite the reader to write
     the first review of a library it could not read. */
  const [loadError, setLoadError] = useState<string | null>(null);

  /* Writing needs an account; reading does not. While the session is still
     being read the write controls are disabled, not swapped for "Sign in" —
     a signed-in reader should never see that flash. */
  const { status, user, displayName } = useAuth();
  const canWrite = status === "signed-in";
  const userId = user?.id ?? null;
  const voted = userId && votes.owner === userId ? votes.ids : NO_VOTES;

  const adopt = useCallback((next: Review[], threads: ReplyIndex) => {
    setReviews(next);
    setReplies(threads);
  }, []);

  /* Ownership is a comparison, not a list: a row is yours when its author id
     is the session's. One rule covers reviews and replies, and it is the same
     rule the database applies on delete, so the button and the policy cannot
     disagree. */
  const own = useMemo(() => {
    const mine = new Set<string>();
    if (!userId) return mine;
    reviews.forEach((review) => {
      if (review.authorId === userId) mine.add(review.id);
    });
    Object.values(replies).forEach((thread) =>
      thread.forEach((reply) => {
        if (reply.authorId === userId) mine.add(reply.id);
      })
    );
    return mine;
  }, [reviews, replies, userId]);

  useEffect(() => {
    let live = true;
    Promise.all([listReviews(), listReplies()])
      .then(([found, threads]) => {
        if (!live) return;
        adopt(found, threads);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Couldn't load reviews. Check your connection and reload."
        );
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [adopt]);

  /* Votes are per account, so they are re-read when the account changes: sign
     in and the buttons you already pressed light up. */
  useEffect(() => {
    if (!userId) return;
    let live = true;
    listMyVotes().then((ids) => {
      if (live) setVotes({ owner: userId, ids });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  /** Every write goes through here, so a failure is one sentence in one place
      and the caller's text is still where they left it. */
  const report = (error: unknown) => {
    toast.error(
      error instanceof Error
        ? error.message
        : "Something went wrong. Try again in a moment."
    );
  };

  const trimmedQuery = query.trim().toLowerCase();
  const hasFilters = Object.values(selected).some((v) => v.length > 0);
  const isBrowsing = !hasFilters && trimmedQuery === "";

  const toggle = (groupKey: string, value: string) => {
    setSelected((current) => {
      const group = current[groupKey] || [];
      const next = group.includes(value)
        ? group.filter((v) => v !== value)
        : [...group, value];
      return { ...current, [groupKey]: next };
    });
  };

  const clear = () => {
    setSelected(EMPTY_SELECTION);
    setQuery("");
  };

  /* The write handlers report a failure and then rethrow it. The forms await
     these and only clear their text on the way out, so the throw is what keeps
     a half-written review on screen after a dropped connection. */

  const handleSubmit = async (draft: ReviewDraft) => {
    try {
      await addReview(draft);
      adopt(await listReviews(), await listReplies());
    } catch (error) {
      report(error);
      throw error;
    }
    setIsComposing(false);
    // A new review can land outside the current filters, which reads as the
    // post having failed. Clearing puts it where the writer expects to see it.
    clear();
    setSort("newest");
  };

  const handleHelpful = async (id: string) => {
    if (!canWrite || !userId || voted.has(id)) return;
    // Flip the button now; the count arrives with the re-fetch. If the vote is
    // refused the flip is undone, so the button never lies for long.
    setVotes({ owner: userId, ids: new Set(voted).add(id) });
    try {
      adopt(await voteHelpful(id), replies);
    } catch (error) {
      setVotes((current) => {
        const ids = new Set(current.ids);
        ids.delete(id);
        return { owner: current.owner, ids };
      });
      report(error);
    }
  };

  const handleDelete = async (id: string) => {
    // The database drops the thread with the review; this drops the open panel
    // and the draft, which would otherwise point at a review that no longer
    // exists.
    try {
      const remaining = await removeReview(id);
      adopt(remaining, await listReplies());
    } catch (error) {
      report(error);
      return;
    }
    if (openThread === id) setOpenThread(null);
    setDrafts((current) => {
      const { [id]: _gone, ...rest } = current;
      return rest;
    });
  };

  /* Opening one thread closes whichever was open. That is the whole of the
     "one discussion, one place" rule — there is no second way to open a
     thread, so there is no way to end up with two. */
  const handleToggleThread = (id: string) => {
    setOpenThread((current) => (current === id ? null : id));
  };

  const handleDraftChange = (reviewId: string, text: string) => {
    setDrafts((current) => ({ ...current, [reviewId]: text }));
  };

  const handleReply = async (draft: ReplyDraft) => {
    try {
      adopt(reviews, await addReply(draft));
    } catch (error) {
      report(error);
      throw error;
    }
  };

  const handleDeleteReply = async (id: string) => {
    try {
      adopt(reviews, await removeReply(id));
    } catch (error) {
      report(error);
    }
  };

  /** True when the review satisfies every group except `skipKey`. */
  const matches = useMemo(
    () => (review: Review, skipKey?: string) => {
      if (trimmedQuery && !searchable(review).includes(trimmedQuery)) {
        return false;
      }
      return FACETS.every((facet) => {
        if (facet.key === skipKey) return true;
        const chosen = selected[facet.key] || [];
        if (chosen.length === 0) return true;
        return facet.values(review).some((value) => chosen.includes(value));
      });
    },
    [selected, trimmedQuery]
  );

  const results = useMemo(() => {
    const found = reviews.filter((review) => matches(review));
    const ordered = [...found];
    if (sort === "helpful") {
      ordered.sort(
        (a, b) => b.helpful - a.helpful || b.createdAt.localeCompare(a.createdAt)
      );
    } else if (sort === "rating-desc") {
      ordered.sort(
        (a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt)
      );
    } else if (sort === "rating-asc") {
      ordered.sort(
        (a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt)
      );
    }
    // `newest` is the order the store already returns.
    return ordered;
  }, [reviews, matches, sort]);

  /* Counts are computed against everything *except* the group they sit in, so
     ticking a second box inside one group widens the result rather than
     zeroing its own siblings. */
  const groups: RailGroup[] = useMemo(
    () =>
      FACETS.map((facet) => {
        const pool = reviews.filter((review) => matches(review, facet.key));
        const counts = new Map<string, number>();

        reviews.forEach((review) =>
          facet.values(review).forEach((value) => {
            if (!counts.has(value)) counts.set(value, 0);
          })
        );
        pool.forEach((review) =>
          facet.values(review).forEach((value) => {
            counts.set(value, (counts.get(value) || 0) + 1);
          })
        );

        const values = facet.order
          ? facet.order.filter((value) => counts.has(value))
          : Array.from(counts.keys()).sort();

        return {
          key: facet.key,
          legend: facet.legend,
          options: values.map((value) => ({
            value,
            label: facet.label ? facet.label(value) : value,
            count: counts.get(value) || 0,
          })),
        };
      })
        /* A facet nobody has answered yet has nothing to tick, and a legend
           with no options under it is the empty label DESIGN.md §5 rules out.
           Boards and arrival condition are both optional, so this is the
           normal state early on, not an edge case. */
        .filter((group) => group.options.length > 0),
    [reviews, matches]
  );

  const coverage = useMemo(() => {
    const parts = new Set<string>();
    const boards = new Set<string>();
    let stated = 0;
    let dead = 0;

    reviews.forEach((review) => {
      parts.add(review.product.id || review.product.name);
      if (review.board) boards.add(review.board);
      if (review.arrivedWorking !== null) {
        stated += 1;
        if (review.arrivedWorking === false) dead += 1;
      }
    });

    return {
      total: reviews.length,
      parts: parts.size,
      boards: boards.size,
      stated,
      dead,
      mean: meanRating(reviews),
    };
  }, [reviews]);

  const plural = (count: number, one: string, many: string) =>
    count === 1 ? one : many;

  return (
    <main className="community">
      <div className="com-hero">
        <div className="com-shell com-hero__inner">
          <div>
            <h1 className="com-hero__title">
              Reviews from people who wired it up
            </h1>
            <p className="com-hero__lead">
              Every review here is pinned to a part you can order, and says what
              board it was tested on and how it held up. A sensor that works on
              an UNO and dies on an ESP32 is two different products.
            </p>

            {/* Coverage and the dead-on-arrival rate are one line, not two
                paragraphs. The DOA figure is still the fact this page exists to
                publish — it keeps the amber and it keeps its denominator, it
                just stops costing a paragraph to say. */}
            {isLoading ? (
              <p className="com-hero__coverage">Loading reviews…</p>
            ) : loadError ? (
              <p className="com-hero__coverage">{loadError}</p>
            ) : coverage.total === 0 ? (
              <p className="com-hero__coverage">
                Nothing here yet. The first review is the one that makes the
                page worth reading.
              </p>
            ) : (
              <p className="com-hero__coverage">
                <b>{coverage.total}</b>{" "}
                {plural(coverage.total, "review", "reviews")} so far, covering{" "}
                <b>{coverage.parts}</b> {plural(coverage.parts, "part", "parts")}
                {coverage.boards > 0 && (
                  <>
                    {" "}
                    across <b>{coverage.boards}</b>{" "}
                    {plural(coverage.boards, "board", "boards")}
                  </>
                )}
                {coverage.mean !== null && (
                  <>
                    , averaging <b>{coverage.mean.toFixed(1)}</b> out of 5
                  </>
                )}
                .
                {coverage.stated > 0 && (
                  <>
                    {" "}
                    <b className="com-hero__signal">{coverage.dead}</b> of{" "}
                    <b>{coverage.stated}</b> arrived dead.
                  </>
                )}
              </p>
            )}
          </div>

          <div className="com-hero__aside">
            {/* One row rather than stacked. The button under the field cost the
                whole band ~44px to say something a row says just as well. */}
            <div className="com-hero__seek">
              <div className="com-search">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search a part, a board, or a problem"
                  aria-label="Search reviews"
                />
              </div>

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
                  <button
                    type="button"
                    className="com-button com-button--compact"
                    disabled
                  >
                    Write a review
                  </button>
                ))}
            </div>

            <p className="com-hero__note">
              Every review is signed by an account and visible to everyone who
              reads this page.
            </p>
          </div>
        </div>
      </div>

      <div className="com-shell">
        {/* With nothing written yet there is nothing to filter, so the rail's
            208px column would be a gutter of empty space beside the one thing
            the page wants you to read. */}
        <div className={"com-body" + (groups.length === 0 ? " com-body--norail" : "")}>
          {groups.length > 0 && (
            <CommunityRail
              groups={groups}
              selected={selected}
              onToggle={toggle}
              onClear={clear}
              hasFilters={hasFilters || trimmedQuery !== ""}
            />
          )}

          <div>
            {isComposing && (
              <ReviewForm
                author={displayName}
                onSubmit={handleSubmit}
                onCancel={() => setIsComposing(false)}
              />
            )}

            {!isLoading && reviews.length > 0 && (
              <div className="com-toolbar">
                <p className="com-toolbar__count">
                  <b>{results.length}</b>{" "}
                  {isBrowsing
                    ? plural(results.length, "review", "reviews")
                    : plural(
                        results.length,
                        "review matches",
                        "reviews match"
                      )}
                </p>

                <label className="com-sort">
                  Sort by
                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as ReviewSort)
                    }
                  >
                    <option value="newest">Newest</option>
                    <option value="helpful">Most helpful</option>
                    <option value="rating-desc">Highest score</option>
                    <option value="rating-asc">Lowest score</option>
                  </select>
                </label>
              </div>
            )}

            {/* A failed load shows nothing here: the hero has said what
                happened, and the "No reviews yet" invitation below would be a
                claim about a library this page could not read. */}
            {isLoading || loadError ? null : results.length > 0 ? (
              <div className="com-feed">
                {results.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    voted={voted.has(review.id)}
                    own={own.has(review.id)}
                    canVote={canWrite}
                    replyCount={(replies[review.id] || []).length}
                    threadOpen={openThread === review.id}
                    onToggleThread={handleToggleThread}
                    onHelpful={handleHelpful}
                    onDelete={handleDelete}
                    thread={
                      <ReplyThread
                        reviewId={review.id}
                        replies={replies[review.id] || []}
                        ownIds={own}
                        author={displayName}
                        canWrite={canWrite}
                        draft={drafts[review.id] || ""}
                        onDraftChange={handleDraftChange}
                        onSubmit={handleReply}
                        onDelete={handleDeleteReply}
                        onClose={() => setOpenThread(null)}
                      />
                    }
                  />
                ))}
              </div>
            ) : reviews.length === 0 ? (
              /* Nothing has ever been written. Says what the page is for and
                 opens the composer, rather than reporting "no results" for a
                 search nobody ran. */
              !isComposing && (
                <div className="com-empty">
                  <h3>No reviews yet</h3>
                  <p>
                    The catalogue can tell you what a part costs and who stocks
                    it. It cannot tell you that the cheap ultrasonic module
                    needs a pull-up, or that one seller&rsquo;s batch arrives dead.
                    That is what this page is for.
                  </p>
                  <p>
                    Tag any of the 2,880 products, give it a score, and say what
                    you wired it to.
                  </p>
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
                </div>
              )
            ) : (
              /* Reviews exist, this combination has none. Names the size of
                 the library so the reader can judge whether to widen or write. */
              <div className="com-empty">
                <h3>No review matches that combination</h3>
                <p>
                  There {plural(coverage.total, "is", "are")}{" "}
                  {coverage.total}{" "}
                  {plural(coverage.total, "review", "reviews")} in total,
                  covering {coverage.parts}{" "}
                  {plural(coverage.parts, "part", "parts")}. Widen the filters,
                  or add the one that is missing.
                </p>
                <div className="com-empty__actions">
                  <button type="button" className="com-button" onClick={clear}>
                    Clear filters
                  </button>
                  {!isComposing && (
                    <button
                      type="button"
                      className="com-linkbutton"
                      onClick={() => setIsComposing(true)}
                    >
                      Write a review
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default Community;
