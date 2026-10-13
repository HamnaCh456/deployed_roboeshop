/**
 * Formatting helpers for the tutorials page.
 *
 * Anything returned from here is rendered in the mono stack — these are the
 * figures a reader compares between two tutorials.
 */

import { Tutorial, TutorialFormat } from '../../types';

/**
 * What the kit costs if you buy every part on the list.
 *
 * Unpriced lines contribute nothing rather than breaking the sum: a brochure
 * seller quoting "Enquiry / POA" has no number to add. `pricedPartCount` is
 * what tells you whether a total covers the whole list, so a screen showing
 * the total can say when it does not.
 */
export const kitTotal = (tutorial: Tutorial): number =>
  tutorial.parts.reduce((sum, part) => sum + part.qty * (part.price ?? 0), 0);

/** How many lines carry a real price. */
export const pricedPartCount = (tutorial: Tutorial): number =>
  tutorial.parts.filter((part) => part.price !== null).length;

/** How many individual items that is, not how many distinct lines. */
export const partCount = (tutorial: Tutorial): number =>
  tutorial.parts.reduce((sum, part) => sum + part.qty, 0);

/** Grouped to three digits, so column-aligned prices stay comparable. */
export const groupDigits = (amount: number): string =>
  amount.toLocaleString('en-US');

/** Grouped to three digits, so column-aligned prices stay comparable. */
export const formatPkr = (amount: number): string =>
  'Rs ' + groupDigits(amount);

/** Video length as m:ss. */
export const formatRuntime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes + ':' + String(rest).padStart(2, '0');
};

export const FORMAT_LABEL: Record<TutorialFormat, string> = {
  video: 'Video',
  guide: 'Build guide',
  wiring: 'Wiring',
  course: 'Course',
};

/** Words a minute, for the reading time below. The conventional figure. */
const READING_SPEED = 200;

/**
 * How much work the tutorial is — in steps where the page has numbered steps,
 * and in reading time where it does not.
 *
 * Every archived RobotShop lesson has at least one numbered step, so this used
 * to return the step count unconditionally. A curated publisher's page often
 * has none: a course page's headings are "Course Overview" and
 * "Prerequisites", and the scraper deliberately refuses to call those steps
 * (`external.ordered_steps`). That left the card printing "0 steps", which is
 * the empty label DESIGN.md §5 rules out — and worse, it reads as a claim that
 * the tutorial has no content.
 *
 * Returns null when there is neither, and the card drops the line.
 */
export const lengthLabel = (tutorial: Tutorial): string | null => {
  if (tutorial.steps > 0) {
    return tutorial.steps + (tutorial.steps === 1 ? ' step' : ' steps');
  }
  if (tutorial.wordCount) {
    return Math.max(1, Math.round(tutorial.wordCount / READING_SPEED)) + ' min read';
  }
  return null;
};
