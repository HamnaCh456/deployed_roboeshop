"use client";

/**
 * The logo strip, without logos: the five stores the crawl covers, set in
 * slate the way Vercel fades customer names, flowing left in a loop. It says
 * "aggregator" in one line, and it is honest about the coverage because the
 * list is the config.
 *
 * The track holds the list twice. The animation slides it exactly half its
 * width, so the moment the first copy has left the frame the second is where
 * the first began, and the loop never shows a seam. The copy is decorative,
 * so it is hidden from assistive tech.
 */

import React from "react";
import { config } from "../../config/config";
import { useReveal } from "./useReveal";

const StoreStrip: React.FC = () => {
  const [ref] = useReveal<HTMLElement>();
  const names = (hidden: boolean) => (
    <span className="stores__set" aria-hidden={hidden || undefined}>
      {config.ui.stores.map((store) => (
        <span key={store} className="stores__name">
          {store}
        </span>
      ))}
    </span>
  );
  return (
    <section className="stores reveal" ref={ref} aria-label="Stores covered">
      <div className="stores__track">
        {names(false)}
        {names(true)}
      </div>
    </section>
  );
};

export default StoreStrip;
