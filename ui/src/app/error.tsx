"use client";

import Link from "next/link";
import React, { useEffect } from "react";

import StatusPage from "../components/status/StatusPage";

/**
 * The root error boundary. Next renders it in place of any page that throws
 * while rendering, inside the layout, so the navbar stays and is itself a
 * way out. `reset()` re-renders the segment that failed; a transient fetch
 * failure usually clears on the second try.
 *
 * The digest is shown because it is what someone would quote when reporting
 * the problem; the message itself is not, because in production Next replaces
 * it with a generic string and in development the overlay already shows it.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the real error in the browser console; the page deliberately
    // does not print it.
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      stamp="Error"
      title="This page hit an error"
      lead="Something went wrong while it was rendering. That's on our side, not yours. Trying again usually works, and the rest of the site is unaffected."
    >
      <div className="status__actions">
        <button
          type="button"
          className="status__button status__button--primary"
          onClick={() => reset()}
        >
          Try again
        </button>
        <Link className="status__button status__button--ghost" href="/">
          Back to the catalogue
        </Link>
      </div>
      {error.digest && <p className="status__ref">Reference {error.digest}</p>}
    </StatusPage>
  );
}
