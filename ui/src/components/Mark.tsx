"use client";

/**
 * The Servo mark: a servo's 180 degree range as a half disc, the needle
 * parked at 45, a notch at the pivot. One shape, one colour. Design record:
 * docs/superpowers/specs/2026-09-19-brand-mark-design.md.
 *
 * The needle and the notch are holes, not ground-coloured strokes, so the
 * same glyph inverts by changing `color`: `#000000` on paper (the one element
 * DESIGN.md lets reach pure black), white on ink. The mask id comes from
 * `useId()` because the navbar and the footer both render one on the same
 * page.
 *
 * The geometry here is the master; `public/logo.svg` and `app/icon.svg`
 * carry the same numbers by hand.
 */

import React, { useId } from "react";

interface MarkProps {
  /** Rendered width in px. The mark is twice as wide as it is tall. */
  width?: number;
  className?: string;
}

const Mark: React.FC<MarkProps> = ({ width = 20, className }) => {
  const maskId = useId();
  return (
    <svg
      className={className}
      width={width}
      height={width / 2}
      viewBox="0 0 24 12"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="12">
        <rect width="24" height="12" fill="#fff" />
        <circle cx="12" cy="12" r="2.2" fill="#000" />
        <path
          d="M12 12 L19.5 4.5"
          stroke="#000"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </mask>
      <path
        d="M0 12 A12 12 0 0 1 24 12 Z"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
};

export default Mark;
