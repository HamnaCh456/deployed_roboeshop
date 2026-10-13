"use client";

/**
 * The feature showcase: one full-bleed photograph at a time, one claim over
 * it, and four tabs along the bottom edge. The active tab's underline fills
 * over four seconds; when it is full the next slide fades in over the last
 * and its tab starts filling. This is General Robotics' industry rail
 * (Warehouse, Government, Manufacturing, Energy) turned into a tour of what
 * Servo does.
 *
 * The clock is the underline itself. It is a CSS animation, and the slide
 * advances on its `animationend`, so the bar and the picture can never fall
 * out of step and there is no interval to clear. Pausing is a matter of
 * `animation-play-state`: the section pauses while it is off screen, while
 * the mouse is over the tab row, or while it holds keyboard focus, and the
 * photograph's slow drift pauses with it because it obeys the same rule.
 *
 * The photographs are the same kind of placeholder as `hero.jpg` (see the
 * spec): General Robotics' assets, to be replaced with our own before the
 * site is public. None repeats the hero (which is their warehouse frame).
 * Three are small web copies (the Compare hand is 210px wide) and read soft
 * at full width until replaced.
 * The two figures in the copy are fetched, not typed.
 */

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { LandingStats } from "../../hooks/useLandingStats";

const figure = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US");

interface Slide {
  key: string;
  label: string;
  image: string;
  /** `object-position` for the crop; each picture keeps its subject clear of the copy. */
  focus: string;
  eyebrow: string;
  title: string;
  line: (s: LandingStats) => string;
  href: string;
  cta: string;
}

const SLIDES: Slide[] = [
  {
    key: "robots",
    label: "Robots",
    image: "/landing/showcase-robots.jpg",
    focus: "center 40%",
    eyebrow: "One catalogue",
    title: "Every robot, every store",
    line: (s) =>
      `${figure(s.robots)} products from ${s.stores} Pakistani stores, searched and filtered in one place.`,
    href: "/catalog",
    cta: "Browse the catalogue",
  },
  {
    key: "compare",
    label: "Compare",
    image: "/landing/showcase-compare.jpg",
    focus: "center 45%",
    eyebrow: "Spec by spec",
    title: "Compare before you buy",
    line: () =>
      "Three robots in one table, the differences highlighted. PKR and USD listings on one price axis, sorted honestly.",
    href: "/catalog",
    cta: "Compare specs",
  },
  {
    key: "tutorials",
    label: "Tutorials",
    image: "/landing/showcase-tutorials.jpg",
    focus: "center 55%",
    eyebrow: "Video tutorials",
    title: "Learn it, then build it",
    line: (s) =>
      `${figure(s.tutorials)} lessons from RobotShop Community, each with the parts it mentions priced against the catalogue.`,
    href: "/tutorials",
    cta: "Open the tutorials",
  },
  {
    key: "community",
    label: "Community",
    image: "/landing/showcase-community.jpg",
    focus: "center 60%",
    eyebrow: "Reviews",
    title: "Reviews from people who built it",
    line: () =>
      "Tag a product, score it, say which board you ran it on. Written by people who have used the part.",
    href: "/community",
    cta: "Read the reviews",
  },
];

const Showcase: React.FC<{ stats: LandingStats }> = ({ stats }) => {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false);

  // Only tick while a fair share of the band is on screen, so a visitor who
  // scrolls down a minute later meets the first slide, not the fourth.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // No observer, no pausing: run from the start, as useReveal does. The
      // class is set on the node rather than in state because React never
      // rewrites `className` here unless `live` changes, and it cannot.
      el.classList.add("is-live");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setLive(entries.some((e) => e.isIntersecting)),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const advance = () => setActive((i) => (i + 1) % SLIDES.length);
  const slide = SLIDES[active];

  return (
    <section
      className={`showcase${live ? " is-live" : ""}`}
      ref={ref}
      aria-labelledby="showcase-title"
    >
      {SLIDES.map((s, i) => (
        <div
          key={s.key}
          className={`showcase__slide${i === active ? " is-active" : ""}`}
          aria-hidden={i !== active}
        >
          {/* next/image is unoptimised here, so this is a plain <img>; the
              drift is a transform on it and the scrim below carries the type. */}
          <Image
            className="showcase__photo"
            src={s.image}
            alt=""
            fill
            sizes="100vw"
            style={{ objectPosition: s.focus }}
          />
        </div>
      ))}
      <div className="showcase__scrim" aria-hidden="true" />

      <div className="showcase__copy" key={slide.key}>
        <p className="eyebrow eyebrow--light">{slide.eyebrow}</p>
        <h2 id="showcase-title" className="display display--light display--wrap">
          {slide.title}
        </h2>
        <p className="lead lead--light">{slide.line(stats)}</p>
        <Link href={slide.href} className="pill pill--paper">
          {slide.cta}
        </Link>
      </div>

      <div className="showcase__tabs wrap" role="tablist" aria-label="What Servo does">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            className={`showcase__tab${i === active ? " is-active" : ""}`}
            aria-selected={i === active}
            onClick={() => setActive(i)}
          >
            {s.label}
            <span className="showcase__track" aria-hidden="true">
              {/* Remounted per slide, so the fill starts from zero each time. */}
              {i === active && (
                <span key={active} className="showcase__bar" onAnimationEnd={advance} />
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default Showcase;
