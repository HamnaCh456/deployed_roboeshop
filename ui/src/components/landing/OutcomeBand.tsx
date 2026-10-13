"use client";

/**
 * The "Choose robots faster" band: one centred outcome on a band one tone
 * below the canvas, with rounded blocks that draw themselves once the band
 * scrolls into view. This is General Robotics' "Deploy robots faster"
 * section, rebuilt in SVG so it ships as markup rather than a Lottie file.
 *
 * It plays once, on entry, over about 1.8s, and never depends on where the
 * scroll stops (an earlier version was scrubbed by scroll position and
 * would freeze half-drawn). `useReveal` adds `is-in` at 35% visible and the
 * stylesheet does the rest with transitions:
 *
 *   - outlines and hairlines draw, via `stroke-dashoffset`, over the first second;
 *   - fills rise from the bottom, a `translateY` inside a clipped group, from 0.6s;
 *   - the copy fades up on its existing delays;
 *   - then a short white dash loops the tall block: the "signal", the one
 *     thing that keeps moving after the picture is finished.
 *
 * Each outline carries its own path length as `--len`, which is both its
 * dasharray and its starting offset, so "hidden" means "offset by exactly
 * its length" and the transition to 0 draws it end to end.
 */

import React from "react";
import Link from "next/link";

import { useReveal } from "./useReveal";

/** `--len` as an inline style; React passes custom properties through untouched. */
const len = (n: number) => ({ "--len": String(n) }) as React.CSSProperties;

const OutcomeBand: React.FC = () => {
  const [ref] = useReveal<HTMLElement>(0.35);

  return (
    <section className="outcome" ref={ref} aria-labelledby="outcome-title">
      <svg
        className="outcome__art"
        viewBox="0 0 1440 720"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          {/* Each clip is its block's own rounded rect, so the fill can rise
              inside it without showing square corners on the way up. */}
          <clipPath id="outcome-clip-a">
            <rect x="24" y="-40" width="290" height="600" rx="40" />
          </clipPath>
          <clipPath id="outcome-clip-b">
            <rect x="1140" y="440" width="300" height="320" rx="40" />
          </clipPath>
        </defs>

        {/* two hairlines that extend across the band */}
        <line className="outcome__hair" x1="0" y1="280" x2="1440" y2="280" />
        <line className="outcome__hair" x1="1440" y1="600" x2="0" y2="600" />

        {/* tall block, top left: outline draws, then the fill rises */}
        <rect className="outcome__draw" style={len(1760)} x="24" y="-40" width="290" height="600" rx="40" />
        <g clipPath="url(#outcome-clip-a)">
          <rect className="outcome__fill" x="24" y="-40" width="290" height="600" rx="40" />
        </g>

        {/* wide block, bottom right */}
        <rect className="outcome__draw" style={len(1240)} x="1140" y="440" width="300" height="320" rx="40" />
        <g clipPath="url(#outcome-clip-b)">
          <rect className="outcome__fill" x="1140" y="440" width="300" height="320" rx="40" />
        </g>

        {/* a trace down and out of the wide block, and a small outlined block hanging off it */}
        <path
          className="outcome__draw"
          style={len(1400)}
          d="M1140 600 H1000 Q960 600 960 640 V760 M1140 600 H1180 Q1200 600 1200 620 V760"
        />
        <rect className="outcome__draw" style={len(900)} x="960" y="620" width="220" height="200" rx="34" />

        {/* the signal that runs the tall block once it is drawn */}
        <rect className="outcome__signal" x="24" y="-40" width="290" height="600" rx="40" />
      </svg>

      <div className="outcome__copy">
        <p className="eyebrow">One search, every store</p>
        <h2 id="outcome-title" className="display">
          Choose robots faster
        </h2>
        <p className="lead">
          Specs, prices and tutorials from every Pakistani robotics store,
          compared before you spend a rupee.
        </p>
        <Link href="/catalog" className="pill pill--ink">
          See how it works
        </Link>
      </div>
    </section>
  );
};

export default OutcomeBand;
