/**
 * The maths behind the numbers band's count-up, kept pure so vitest can run
 * it (the config is node-only, no DOM). The hook in Numbers.tsx calls
 * `countAt` once per animation frame.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fast start, soft landing: 1 - (1 - t)^3. */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The whole number to show `elapsed` ms into a count that waits `delay` ms,
 * then runs from `from` to `to` over `duration` ms. Before the delay it is
 * `from`; after delay + duration it is `to`.
 */
export function countAt(
  from: number,
  to: number,
  elapsed: number,
  delay: number,
  duration: number,
): number {
  const t = clamp((elapsed - delay) / duration, 0, 1);
  return Math.round(from + (to - from) * easeOutCubic(t));
}
