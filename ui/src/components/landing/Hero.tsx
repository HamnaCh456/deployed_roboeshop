"use client";

/**
 * The hero. Assistant-first: the headline is a question and the ask bar is
 * the answer. Everything sits in the top third of the photo, because the
 * robot in the centre of the frame is the picture and must stay visible.
 *
 * The photo is the one place the design system permits a photograph. The
 * file in `public/landing/hero.jpg` is a placeholder (see the spec) and is
 * to be replaced with our own before the site is public.
 */

import React from "react";
import Image from "next/image";
import Link from "next/link";

import AskBar from "./AskBar";
import { LandingStats } from "../../hooks/useLandingStats";

const EXAMPLES = [
  "best first kit for a 10-year-old",
  "which arms support Python",
];

const figure = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US");

const Hero: React.FC<{ stats: LandingStats }> = ({ stats }) => (
  <section className="hero" aria-labelledby="hero-title">
    {/* next/image is unoptimised in this project, so this is a plain <img>
        underneath; the scrim below is what makes white type readable. */}
    <Image className="hero__photo" src="/landing/hero.jpg" alt="" fill priority sizes="100vw" />
    <div className="hero__scrim" aria-hidden="true" />

    <div className="hero__copy">
      <p className="eyebrow eyebrow--light">Pakistan&rsquo;s robotics marketplace</p>
      <h1 id="hero-title" className="hero__title">
        What are you building?
      </h1>
      <AskBar
        label="Ask Servo"
        hotkey
        placeholder="A line-following robot for a 2nd-year lab, under Rs 15,000"
      />
      <p className="hero__examples">
        Try{" "}
        {EXAMPLES.map((q, i) => (
          <React.Fragment key={q}>
            <Link href={`/assistant?q=${encodeURIComponent(q)}`}>{q}</Link>
            {i < EXAMPLES.length - 1 ? " or " : ""}
          </React.Fragment>
        ))}
      </p>
    </div>

    <p className="hero__stats mono">
      {figure(stats.robots)} robots · {figure(stats.tutorials)} tutorials ·{" "}
      {stats.stores} stores
    </p>
  </section>
);

export default Hero;
