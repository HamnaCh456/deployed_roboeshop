"use client";

/**
 * Four figures, no headline. Every one is fetched (see useLandingStats), so
 * the band cannot claim a number the catalogue does not hold. A dash means
 * the server has not answered yet, not zero.
 *
 * Once the band scrolls into view each figure counts up from 0 over 1.2s,
 * one starting 120ms after the last, left to right. The count always runs
 * from the value on screen to the new target, so a figure that arrives late
 * counts up then, and a refetch moves from the old value rather than
 * restarting. Reduced motion shows the target at once.
 */

import React, { useEffect, useRef, useState } from "react";
import { LandingStats } from "../../hooks/useLandingStats";
import { countAt } from "./countUp";
import { useReveal } from "./useReveal";

const DURATION = 1200;
const STAGGER = 120;

function useCountUp(target: number | null, delay: number, active: boolean): number | null {
  const [shown, setShown] = useState<number | null>(null);
  // The last value painted, so a new target counts on from it.
  const shownRef = useRef(0);

  useEffect(() => {
    if (!active || target === null) return;
    const reduce =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Under reduced motion the count starts at its end, so the first frame
    // already shows the target. Still a frame, so no setState runs inside
    // the effect body itself.
    const from = reduce ? target : shownRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const v = countAt(from, target, elapsed, delay, DURATION);
      shownRef.current = v;
      setShown(v);
      if (elapsed < delay + DURATION) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delay, active]);

  // Null until the server answers; 0 for the frame before the count starts.
  return target === null ? null : (shown ?? 0);
}

const figure = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US");

const Figure: React.FC<{ target: number | null; delay: number; active: boolean; label: string }> = ({
  target,
  delay,
  active,
  label,
}) => {
  const shown = useCountUp(target, delay, active);
  return (
    <div className="numbers__item">
      <div className="numbers__value">{figure(shown)}</div>
      <div className="eyebrow eyebrow--muted">{label}</div>
    </div>
  );
};

const Numbers: React.FC<{ stats: LandingStats }> = ({ stats }) => {
  const [ref, inView] = useReveal<HTMLElement>();
  const items: { target: number | null; label: string }[] = [
    { target: stats.robots, label: "robots and parts" },
    // "Uncategorised" is a bucket, not a category, so it is not counted.
    {
      target: stats.categories
        ? stats.categories.filter((f) => f.value !== "Uncategorised").length
        : null,
      label: "categories",
    },
    { target: stats.tutorials, label: "tutorials" },
    { target: stats.stores, label: "stores, one price axis" },
  ];
  return (
    <section className="numbers wrap reveal" ref={ref} aria-label="Coverage">
      {items.map((item, i) => (
        <Figure key={item.label} {...item} delay={i * STAGGER} active={inView} />
      ))}
    </section>
  );
};

export default Numbers;
