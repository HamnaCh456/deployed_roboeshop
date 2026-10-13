"use client";

/**
 * `/assistant` with its query string read. `?q=` is the question the landing
 * page's ask bar was given; it goes to Chatbox as `initialQuery`. The
 * Suspense boundary is what lets `useSearchParams` coexist with the static
 * prerender (the same arrangement CatalogScreen uses).
 */

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import Apparel from "../Apparel";
import Chatbox from "./chatbox";

const AssistantWithQuery: React.FC = () => {
  const params = useSearchParams();
  const q = params.get("q")?.trim() || undefined;
  return <Chatbox initialQuery={q} />;
};

const AssistantScreen: React.FC = () => (
  <>
    <Apparel />
    {/* A null fallback, not a second <Chatbox />: two instances would each
        play the intro, and the first would be thrown away mid-sentence. */}
    <Suspense fallback={null}>
      <AssistantWithQuery />
    </Suspense>
  </>
);

export default AssistantScreen;
