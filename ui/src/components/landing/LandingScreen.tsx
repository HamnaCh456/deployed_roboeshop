"use client";

/**
 * The landing page: the front door at `/`. Design record:
 * docs/superpowers/specs/2026-09-19-landing-page-design.md.
 *
 * `.landing` is the scroll container. The root layout is a fixed-height flex
 * column, so the page scrolls inside this element (the tutorials and
 * community pages do the same), and OutcomeBand listens to it rather than
 * to `window`.
 */

import React from "react";

import "../../landing.css";

import { useLandingStats } from "../../hooks/useLandingStats";
import Hero from "./Hero";
import StoreStrip from "./StoreStrip";
import OutcomeBand from "./OutcomeBand";
import Numbers from "./Numbers";
import Showcase from "./Showcase";
import LandingFooter from "./LandingFooter";

const LandingScreen: React.FC = () => {
  const stats = useLandingStats();
  return (
    <main className="landing">
      <Hero stats={stats} />
      <StoreStrip />
      <OutcomeBand />
      <Numbers stats={stats} />
      <Showcase stats={stats} />
      <LandingFooter />
    </main>
  );
};

export default LandingScreen;
