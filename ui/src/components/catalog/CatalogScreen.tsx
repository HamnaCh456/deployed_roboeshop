"use client";

/**
 * The catalogue route body, shared by /, /catalog and /catalog/[category].
 * Browsing is the front door: the 2,880 scraped products were previously
 * reachable only by knowing what to ask the assistant for; the catalogue
 * takes the full width and the assistant becomes a launcher in the corner.
 *
 * `Catalog` reads the query string, and the App Router insists that anything
 * calling `useSearchParams` sits under a Suspense boundary so the static
 * shell can prerender without it. The fallback is empty on purpose: the
 * skeleton grid inside Catalog already covers the loading state.
 */

import React, { Suspense } from "react";

import Catalog from "./Catalog";
import ChatWidget from "./ChatWidget";

const CatalogScreen: React.FC = () => (
  <>
    <Suspense fallback={null}>
      <Catalog />
    </Suspense>
    <ChatWidget />
  </>
);

export default CatalogScreen;
