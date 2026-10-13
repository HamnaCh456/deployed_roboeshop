/**
 * Formatting for the community page.
 *
 * Everything returned from here lands in the mono stack — these are figures a
 * reader compares between two reviews.
 */

import { Review } from "../../types/community";

/**
 * The catalogue quotes PKR on four sites and USD on one, so a price here
 * cannot assume a symbol the way the tutorials page can. The unit is returned
 * separately because it is a mark on the amount, not part of it — see
 * `.fig__unit` in tutorials.css and DESIGN.md §2.
 */
export const priceUnit = (currency: string): string =>
  currency === "USD" ? "$" : "Rs";

export const groupDigits = (amount: number): string =>
  Math.round(amount).toLocaleString("en-US");

/**
 * "3 days ago". Anything past a year reverts to the date — "14 months ago"
 * is arithmetic the reader should not have to do.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const steps: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2629800, "month"],
  ];

  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const [size, name] = steps[i];
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      if (name === "month" && count >= 12) break;
      return `${count} ${name}${count === 1 ? "" : "s"} ago`;
    }
  }

  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The full date, for the tooltip and the machine-readable attribute. */
export const exactDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** "6 months in use", or null when the reviewer did not say. */
export function useLabel(months: number | null): string | null {
  if (months === null) return null;
  if (months < 1) return "under a month in use";
  if (months === 1) return "1 month in use";
  if (months < 12) return `${months} months in use`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year in use" : `${years} years in use`;
}

/**
 * Mean rating to one decimal.
 *
 * Returns null for an empty set rather than 0, because "no reviews" and "rated
 * zero" are different claims and only one of them is sayable on a 1–5 scale.
 */
export function meanRating(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}
