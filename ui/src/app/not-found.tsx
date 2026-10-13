"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import StatusPage from "../components/status/StatusPage";

/**
 * The root not-found boundary. Next serves it for every URL that matches no
 * route and prerenders it as `/_not-found`. A client component so it can
 * read the address that failed: naming it is more use than "page not found",
 * because a mistyped link is the usual cause and the typo is right there.
 */
export default function NotFound() {
  const pathname = usePathname();

  return (
    <StatusPage
      stamp="Not found"
      figure="404"
      title="There's nothing at this address"
      lead={
        <>
          {pathname ? (
            <>
              <span className="status__path">{pathname}</span> doesn&apos;t
              exist here.
            </>
          ) : (
            "This address doesn't exist here."
          )}{" "}
          The link may be old or mistyped. The catalogue, tutorials and
          community are all still where they were.
        </>
      }
    >
      <div className="status__actions">
        <Link className="status__button status__button--primary" href="/">
          Browse the catalogue
        </Link>
        <Link className="status__button status__button--ghost" href="/tutorials">
          Tutorials
        </Link>
        <Link className="status__link" href="/assistant">
          Ask the assistant
        </Link>
      </div>
    </StatusPage>
  );
}
