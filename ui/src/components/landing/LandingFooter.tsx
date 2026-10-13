"use client";

/**
 * The footer, on ink: the wordmark and one line about the product on the
 * left, then three headed columns of links, then a hairline and the legal
 * line. The layout is Profound's (profound.com), which is the conventional
 * SaaS footer done quietly: headings in white, links in muted white, a lot
 * of air, nothing decorative.
 *
 * Every column is fed from `config.ts`: the categories are the navbar's
 * taxonomy, the sources are the stores the crawl covers. The sources are
 * names, not links, because the app does not hold their URLs; they are set
 * one shade dimmer so they do not pretend to be clickable.
 */

import React from "react";
import Link from "next/link";
import { config } from "../../config/config";
import Mark from "../Mark";
import { categorySlug } from "../Navbar";

const sentenceCase = (label: string): string =>
  label.charAt(0) + label.slice(1).toLowerCase();

const LandingFooter: React.FC = () => {
  const { brand, categories, stores } = config.ui;
  return (
    <footer className="foot">
      <div className="wrap foot__grid">
        <div className="foot__brand">
          <Link href="/" className="foot__mark">
            <Mark width={20} className="foot__glyph" />
            {brand}
          </Link>
          <p className="foot__about">
            A unified web aggregation platform for educational and industrial
            robots. Specs, prices and tutorials from every Pakistani robotics
            store, compared before you spend a rupee.
          </p>
          <a
            className="foot__link"
            href="https://github.com/NVIDIA-AI-Blueprints/retail-shopping-assistant"
            target="_blank"
            rel="noreferrer"
          >
            Built on NVIDIA&rsquo;s Retail Shopping Assistant blueprint
          </a>
        </div>

        <nav className="foot__col" aria-labelledby="foot-explore">
          <h2 id="foot-explore" className="foot__head">Explore</h2>
          <Link href="/catalog" className="foot__link">Catalogue</Link>
          <Link href="/catalog" className="foot__link">Compare</Link>
          <Link href="/tutorials" className="foot__link">Tutorials</Link>
          <Link href="/community" className="foot__link">Community</Link>
          <Link href="/assistant" className="foot__link">Ask {brand}</Link>
        </nav>

        <nav className="foot__col" aria-labelledby="foot-categories">
          <h2 id="foot-categories" className="foot__head">Categories</h2>
          {categories.map((category) => (
            <Link
              key={category}
              href={`/catalog/${categorySlug(category)}`}
              className="foot__link"
            >
              {sentenceCase(category)}
            </Link>
          ))}
        </nav>

        <div className="foot__col" aria-labelledby="foot-sources">
          <h2 id="foot-sources" className="foot__head">Prices from</h2>
          {stores.map((store) => (
            <span key={store} className="foot__source">{store}</span>
          ))}
        </div>
      </div>

      <div className="wrap foot__legal">
        <span>&copy; {new Date().getFullYear()} {brand}</span>
        <span>Prices shown as each seller quoted them. Refreshed by crawl.</span>
      </div>
    </footer>
  );
};

export default LandingFooter;
