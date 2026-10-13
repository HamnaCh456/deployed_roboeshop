/**
 * Everything the dashboard shows, gathered in one place.
 *
 * Five sources, each loaded on its own and failing on its own: the mock
 * server's `/health`, an unfiltered `/catalog` page (its facets), a
 * `/catalog?sort=sellers-desc` page (products several stores carry),
 * `/tutorials`, and the community tables in Supabase. A dead mock server
 * blanks the catalogue panels and leaves the reviews standing; Supabase being
 * down does the reverse. That is why each source carries its own error rather
 * than the page having one.
 *
 * The three catalogue requests go through `fetchCache`, so a visitor who has
 * already been to the landing page or the catalogue pays for none of them.
 *
 * The personal figures are counts over rows the community page already reads,
 * filtered by the session's user id. Nothing here is invented: an account
 * with no reviews has zeros, and the page words that as an invitation.
 *
 * Design record: docs/superpowers/specs/2026-09-19-dashboard-design.md
 */

import { useEffect, useMemo, useState } from "react";

import { config } from "../config/config";
import { fetchCache } from "../lib/fetchCache";
import { listReplies, listReviews } from "../data/reviewStore";
import {
  CatalogFacets,
  CatalogProduct,
  CatalogResponse,
} from "../types/catalog";
import { ReplyIndex, Review } from "../types/community";
import { Tutorial } from "../types";

interface Health {
  status: string;
  robots: number;
  tutorials: number;
  /** Absent on a mock server older than the dashboard. */
  multiSeller?: number;
}

interface TutorialsResponse {
  tutorials: Tutorial[];
  count: number;
}

/** One source's answer: the data once it arrives, or the sentence to show. */
export interface Source<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export interface Activity {
  reviews: number;
  replies: number;
  /** Helpful votes other people have given this account's reviews. */
  helpful: number;
  /** Newest first; null when the account has written nothing. */
  latest: Review | null;
  /** Replies under `latest`. */
  latestReplies: number;
}

export interface Dashboard {
  health: Source<Health>;
  /** Category, platform and skill counts over the whole catalogue. */
  facets: Source<CatalogFacets>;
  /** Up to four products with more than one offer. */
  compared: Source<CatalogProduct[]>;
  tutorials: Source<Tutorial[]>;
  reviews: Source<Review[]>;
  /** Null while signed out, or until the reviews arrive. */
  activity: Activity | null;
}

const HEALTH_URL = `${config.api.baseUrl}/health`;
const CATALOG_URL = `${config.api.baseUrl}/catalog`;
const COMPARED_URL = `${config.api.baseUrl}/catalog?sort=sellers-desc`;
const TUTORIALS_URL = `${config.api.baseUrl}/tutorials`;

const CATALOG_DOWN =
  "The catalogue server isn't answering. Start mock-server and reload.";

const pending = <T>(): Source<T> => ({
  data: null,
  error: null,
  isLoading: true,
});

/** Seeds from the cache, so a page already paid for renders on its first frame. */
function cached<T>(url: string): Source<T> {
  const hit = fetchCache.peek<T>(url);
  return hit === undefined
    ? pending<T>()
    : { data: hit, error: null, isLoading: false };
}

function useCached<T>(url: string, failure: string): Source<T> {
  const [state, setState] = useState<Source<T>>(() => cached<T>(url));

  useEffect(() => {
    if (fetchCache.peek(url) !== undefined) return;
    let live = true;
    fetchCache
      .load<T>(url)
      .then((data) => live && setState({ data, error: null, isLoading: false }))
      .catch(
        () => live && setState({ data: null, error: failure, isLoading: false })
      );
    return () => {
      live = false;
    };
  }, [url, failure]);

  return state;
}

const newestFirst = (a: Tutorial, b: Tutorial): number =>
  (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");

export function useDashboard(userId: string | null): Dashboard {
  const health = useCached<Health>(HEALTH_URL, CATALOG_DOWN);
  const catalog = useCached<CatalogResponse>(CATALOG_URL, CATALOG_DOWN);
  const comparedPage = useCached<CatalogResponse>(COMPARED_URL, CATALOG_DOWN);
  const library = useCached<TutorialsResponse>(
    TUTORIALS_URL,
    "The tutorial server isn't answering. Start mock-server and reload."
  );

  const [reviews, setReviews] = useState<Source<Review[]>>(pending);
  const [replies, setReplies] = useState<ReplyIndex>({});

  useEffect(() => {
    let live = true;
    Promise.all([listReviews(), listReplies()])
      .then(([found, threads]) => {
        if (!live) return;
        setReviews({ data: found, error: null, isLoading: false });
        setReplies(threads);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setReviews({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Couldn't load reviews. Check your connection and reload.",
          isLoading: false,
        });
      });
    return () => {
      live = false;
    };
  }, []);

  const activity = useMemo<Activity | null>(() => {
    if (!userId || !reviews.data) return null;
    // listReviews() is newest first, so the first of mine is my latest.
    const mine = reviews.data.filter((review) => review.authorId === userId);
    const replyCount = Object.values(replies).reduce(
      (sum, thread) =>
        sum + thread.filter((reply) => reply.authorId === userId).length,
      0
    );
    const latest = mine[0] ?? null;
    return {
      reviews: mine.length,
      replies: replyCount,
      helpful: mine.reduce((sum, review) => sum + review.helpful, 0),
      latest,
      latestReplies: latest ? (replies[latest.id] || []).length : 0,
    };
  }, [userId, reviews.data, replies]);

  return {
    health,
    facets: {
      ...catalog,
      data: catalog.data ? catalog.data.facets : null,
    },
    compared: {
      ...comparedPage,
      data: comparedPage.data
        ? comparedPage.data.products.filter((p) => p.offerCount > 1).slice(0, 4)
        : null,
    },
    tutorials: {
      ...library,
      data: library.data
        ? [...(library.data.tutorials || [])].sort(newestFirst)
        : null,
    },
    reviews,
    activity,
  };
}
