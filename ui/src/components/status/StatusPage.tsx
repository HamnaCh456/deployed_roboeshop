"use client";

/**
 * The shell the 404 and the error boundary render into: a mono stamp, an
 * optional display figure, a title, one lead, and whatever actions the page
 * passes as children. Design record:
 * docs/superpowers/specs/2026-09-19-status-pages-design.md.
 */

import React from "react";

import "../../status.css";

interface StatusPageProps {
  /** The mono eyebrow above everything: "Not found", "Error". */
  stamp: string;
  /** A display-size figure between stamp and title, e.g. "404". */
  figure?: string;
  title: string;
  /** Says what happened and what to do next (DESIGN.md §10, Voice). */
  lead: React.ReactNode;
  /** The action row, and anything below it. */
  children: React.ReactNode;
}

const StatusPage: React.FC<StatusPageProps> = ({
  stamp,
  figure,
  title,
  lead,
  children,
}) => (
  <main className="status">
    <section className="status__body" aria-labelledby="status-title">
      <p className="status__stamp">{stamp}</p>
      {figure && (
        <p className="status__figure" aria-hidden="true">
          {figure}
        </p>
      )}
      <h1 className="status__title" id="status-title">
        {title}
      </h1>
      <p className="status__lead">{lead}</p>
      {children}
    </section>
  </main>
);

export default StatusPage;
