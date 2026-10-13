"use client";

/**
 * `/dashboard`, the signed-in home.
 *
 * Every figure comes from `useDashboard()`: `/health`, `/catalog` facets, the
 * products several stores carry, `/tutorials`, and the Supabase reviews. Each
 * panel loads and fails on its own, so a dead mock server greys out the
 * catalogue tiles while the reviewer's own numbers stay up, and Supabase being
 * down does the reverse.
 *
 * Three states beyond "loaded", drawn as board 2 of the dashboard mockups:
 *   - A new account (nothing written yet) gets a three-step start list and an
 *     empty-state card instead of a row of zeros.
 *   - The catalogue server not answering gets one banner naming the command
 *     that fixes it, and its tiles read "Unavailable".
 *   - Loading is a skeleton per panel, never one spinner for the page.
 *
 * Signed out, the page asks the visitor to sign in rather than redirecting:
 * nothing on this site is behind a login wall (CLAUDE.md), and this page is
 * only empty without an account, not secret.
 */

import Link from "next/link";
import React from "react";

import { useAuth } from "../../context/AuthContext";
import { Source, useDashboard } from "../../hooks/useDashboard";
import { FacetOption } from "../../types/catalog";
import { Tutorial } from "../../types";
import ProductCard from "../catalog/ProductCard";
import Mark from "../Mark";
import { categorySlug } from "../Navbar";
import { timeAgo } from "../community/format";
// ProductCard's rules live in catalog.css; dashboard.css supplies the tokens.
import "../../catalog.css";
import "../../dashboard.css";

const fmt = (n: number): string => n.toLocaleString("en-US");

/* -- small pieces ------------------------------------------------------- */

interface TileProps {
  label: string;
  source: Source<unknown>;
  value: number | undefined;
  note: string;
  inverted?: boolean;
}

const Tile: React.FC<TileProps> = ({
  label,
  source,
  value,
  note,
  inverted,
}) => {
  const down = Boolean(source.error);
  return (
    <div className={inverted ? "dash-tile dash-tile--ink" : "dash-tile"}>
      <span className="dash-eyebrow">{label}</span>
      {source.isLoading ? (
        <span className="dash-skel" style={{ width: 96, height: 36 }} />
      ) : (
        <span
          className={
            down ? "dash-tile__value dash-tile__value--off" : "dash-tile__value"
          }
        >
          {down || value === undefined ? "··" : fmt(value)}
        </span>
      )}
      <span className="dash-tile__note">{down ? "Unavailable" : note}</span>
    </div>
  );
};

const PanelSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="dash-stack" aria-hidden="true">
    <span className="dash-skel" style={{ width: 160, height: 16 }} />
    {Array.from({ length: rows }, (_, i) => (
      <span
        key={i}
        className="dash-skel"
        style={{ width: `${100 - i * 18}%`, height: 8 }}
      />
    ))}
  </div>
);

const PanelError: React.FC<{ message: string }> = ({ message }) => (
  <p className="dash-muted">{message}</p>
);

/* -- panels --------------------------------------------------------------- */

const CategoryBars: React.FC<{ options: FacetOption[] }> = ({ options }) => {
  const shown = options.filter((o) => o.value !== "Uncategorised").slice(0, 7);
  const max = Math.max(1, ...shown.map((o) => o.count));
  return (
    <ul className="dash-bars">
      {shown.map((o) => (
        <li key={o.value}>
          <Link
            href={`/catalog/${categorySlug(o.value)}`}
            className="dash-bars__row"
          >
            <span className="dash-bars__label">{o.value}</span>
            <span className="dash-bar">
              <i style={{ width: `${(o.count / max) * 100}%` }} />
            </span>
            <span className="dash-num">{fmt(o.count)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
};

/** Beginner, Intermediate, Advanced in that order, lightest to darkest. */
const SKILL_ORDER = ["Beginner", "Intermediate", "Advanced"];

const SkillSplit: React.FC<{ options: FacetOption[] }> = ({ options }) => {
  const rows = SKILL_ORDER.map((level) => ({
    level,
    count: options.find((o) => o.value === level)?.count ?? 0,
  }));
  const total = Math.max(
    1,
    rows.reduce((sum, r) => sum + r.count, 0)
  );
  return (
    <div className="dash-stack">
      <span className="dash-eyebrow">Skill level</span>
      <div
        className="dash-split"
        role="img"
        aria-label={rows.map((r) => `${r.level} ${r.count}`).join(", ")}
      >
        {rows.map((r) => (
          <span
            key={r.level}
            className={`dash-split__${r.level.toLowerCase()}`}
            style={{ width: `${(r.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="dash-legend">
        {rows.map((r) => (
          <span key={r.level}>
            <i className={`dash-split__${r.level.toLowerCase()}`} />
            {r.level} {fmt(r.count)}
          </span>
        ))}
      </div>
    </div>
  );
};

/* The thumbnail is a background, not an <img>: an Archive capture that fails
   to load leaves the grey tile rather than a broken-image glyph, and the
   lint rule against <img> gains no new warning. */
const TutorialRow: React.FC<{ tutorial: Tutorial }> = ({ tutorial }) => (
  <li>
    <a
      className="dash-row"
      href={tutorial.sourceUrl}
      target="_blank"
      rel="noreferrer"
    >
      <span
        className="dash-thumb"
        style={
          tutorial.image
            ? { backgroundImage: `url("${tutorial.image}")` }
            : undefined
        }
      >
        {!tutorial.image && <span className="dash-eyebrow">No photo</span>}
      </span>
      <span className="dash-row__text">
        <span className="dash-row__title">{tutorial.title}</span>
        <span className="dash-muted">
          {[tutorial.author, tutorial.category].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="dash-pill">{tutorial.level}</span>
    </a>
  </li>
);

/* -- the page ------------------------------------------------------------- */

const Dashboard: React.FC = () => {
  const { status, user, displayName, profile } = useAuth();
  const dash = useDashboard(user?.id ?? null);
  const { health, facets, compared, tutorials, reviews, activity } = dash;

  if (status === "signed-out") {
    return (
      <div className="dashboard">
        <div className="dash-page">
          <section className="dash-card dash-empty">
            <Mark width={56} className="text-[#c9c9c9]" />
            <h1 className="dash-h2">Sign in to see your dashboard</h1>
            <p className="dash-muted">
              Your reviews, replies and helpful votes, next to what the
              catalogue holds today.
            </p>
            <Link
              className="dash-btn dash-btn--ink"
              href="/auth/login?next=%2Fdashboard"
            >
              Sign in
            </Link>
          </section>
        </div>
      </div>
    );
  }

  const name = displayName || profile?.displayName || "";
  const isNew =
    activity !== null && activity.reviews === 0 && activity.replies === 0;
  const catalogueDown = Boolean(health.error);

  return (
    <div className="dashboard">
      <div className="dash-page">
        {/* Greeting */}
        <header className="dash-head">
          <div className="dash-stack">
            <span className="dash-eyebrow dash-eyebrow--ink">Dashboard</span>
            <h1 className="dash-h1">
              {isNew ? "Welcome to Servo" : "Welcome back"}
              {name ? `, ${name}` : ""}
            </h1>
            {isNew && (
              <p className="dash-lead">
                Your account is ready. Nothing here is yours yet, so start with
                one of these.
              </p>
            )}
          </div>
          {!isNew && (
            <div className="dash-actions">
              <Link className="dash-btn" href="/community">
                Write a review
              </Link>
              <Link className="dash-btn dash-btn--ink" href="/catalog">
                Browse catalogue
              </Link>
            </div>
          )}
        </header>

        {/* Tiles */}
        <section className="dash-tiles" aria-label="At a glance">
          <Tile
            label="Products"
            source={health}
            value={health.data?.robots}
            note="Unique, across every store"
          />
          <Tile
            label="Price compared"
            source={health}
            value={health.data?.multiSeller}
            note="Sold on more than one store"
          />
          <Tile
            label="Tutorials"
            source={health}
            value={health.data?.tutorials}
            note="From RobotShop Community"
          />
          <Tile
            label="Your reviews"
            source={reviews}
            value={activity?.reviews}
            note={
              activity
                ? `${fmt(activity.helpful)} marked helpful by others`
                : "Loading"
            }
            inverted
          />
        </section>

        {/* Catalogue server down */}
        {catalogueDown && (
          <section className="dash-card dash-banner" role="alert">
            <div className="dash-stack dash-banner__text">
              <strong>The catalogue server isn&apos;t answering.</strong>
              <span className="dash-body">
                Start mock-server and reload. Your reviews below are unaffected.
              </span>
            </div>
            <code className="dash-cli">
              ▲ cd mock-server &amp;&amp; node server.js
            </code>
            <button
              type="button"
              className="dash-btn dash-btn--ink"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </section>
        )}

        {/* New account: start list + empty activity */}
        {isNew && (
          <section className="dash-grid">
            <div className="dash-card">
              <h2 className="dash-h3">Get started</h2>
              <ol className="dash-steps">
                <li>
                  <span className="dash-step__num">1</span>
                  <span className="dash-row__text">
                    <span className="dash-row__title">Find a part</span>
                    <span className="dash-muted">
                      Filter {health.data ? fmt(health.data.robots) : "every"}{" "}
                      products by board, skill and price.
                    </span>
                  </span>
                  <Link className="dash-btn" href="/catalog">
                    Catalogue
                  </Link>
                </li>
                <li>
                  <span className="dash-step__num">2</span>
                  <span className="dash-row__text">
                    <span className="dash-row__title">Follow a tutorial</span>
                    <span className="dash-muted">
                      {health.data ? fmt(health.data.tutorials) : "Real"}{" "}
                      builds, each with the parts it mentions.
                    </span>
                  </span>
                  <Link className="dash-btn" href="/tutorials">
                    Tutorials
                  </Link>
                </li>
                <li>
                  <span className="dash-step__num">3</span>
                  <span className="dash-row__text">
                    <span className="dash-row__title">
                      Review something you own
                    </span>
                    <span className="dash-muted">
                      Say which board you tested it on.
                    </span>
                  </span>
                  <Link className="dash-btn dash-btn--ink" href="/community">
                    Write a review
                  </Link>
                </li>
              </ol>
            </div>
            <div className="dash-card dash-empty">
              <Mark width={56} className="text-[#c9c9c9]" />
              <h2 className="dash-h3">No reviews yet</h2>
              <p className="dash-muted">
                Your reviews, replies and helpful votes will show up here once
                you post one.
              </p>
              <Link className="dash-btn" href="/community">
                Go to community
              </Link>
            </div>
          </section>
        )}

        {/* Catalogue breakdown */}
        {!catalogueDown && (
          <section className="dash-grid">
            <div className="dash-card dash-stack">
              <div className="dash-card__head">
                <h2 className="dash-h3">Catalogue by category</h2>
                <Link href="/catalog" className="dash-link">
                  Open catalogue
                </Link>
              </div>
              {facets.isLoading && <PanelSkeleton rows={6} />}
              {facets.data && <CategoryBars options={facets.data.category} />}
            </div>
            <div className="dash-card dash-stack dash-stack--loose">
              <h2 className="dash-h3">Who it suits</h2>
              {facets.isLoading && <PanelSkeleton rows={3} />}
              {facets.data && (
                <>
                  <SkillSplit options={facets.data.skill} />
                  <div className="dash-stack">
                    <span className="dash-eyebrow">Top platforms</span>
                    <div className="dash-chips">
                      {facets.data.platform.slice(0, 6).map((p) => (
                        <Link
                          key={p.value}
                          className="dash-chip"
                          href={`/catalog?platform=${encodeURIComponent(
                            p.value
                          )}`}
                        >
                          {p.value}{" "}
                          <span className="dash-num">{fmt(p.count)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* Sold on the most stores */}
        {!catalogueDown &&
          (compared.isLoading ||
            (compared.data && compared.data.length > 0)) && (
            <section className="dash-section">
              <div className="dash-card__head">
                <div className="dash-stack">
                  <span className="dash-eyebrow dash-eyebrow--ink">
                    Price comparison
                  </span>
                  <h2 className="dash-h2">Sold on the most stores</h2>
                </div>
                <Link href="/catalog?sort=sellers-desc" className="dash-link">
                  See all
                  {health.data?.multiSeller
                    ? ` ${fmt(health.data.multiSeller)}`
                    : ""}
                </Link>
              </div>
              {compared.isLoading ? (
                <div className="dash-products">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="dash-skel"
                      style={{ height: 320, borderRadius: 16 }}
                    />
                  ))}
                </div>
              ) : (
                <div className="dash-products">
                  {compared.data!.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </section>
          )}

        {/* Tutorials + activity */}
        <section className="dash-grid dash-section">
          {!catalogueDown && (
            <div className="dash-card">
              <div className="dash-card__head">
                <h2 className="dash-h3">Newest tutorials</h2>
                <Link href="/tutorials" className="dash-link">
                  All{tutorials.data ? ` ${fmt(tutorials.data.length)}` : ""}
                </Link>
              </div>
              {tutorials.isLoading && <PanelSkeleton rows={3} />}
              {tutorials.error && <PanelError message={tutorials.error} />}
              {tutorials.data && tutorials.data.length === 0 && (
                <p className="dash-muted">
                  No tutorials yet. Run run_tutorials.py in scraper/, then
                  restart mock-server.
                </p>
              )}
              {tutorials.data && tutorials.data.length > 0 && (
                <ul className="dash-list">
                  {tutorials.data.slice(0, 3).map((t) => (
                    <TutorialRow key={t.id} tutorial={t} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {!isNew && (
            <div className="dash-card dash-stack">
              <div className="dash-card__head">
                <h2 className="dash-h3">Your activity</h2>
                <Link href="/community" className="dash-link">
                  Community
                </Link>
              </div>
              {reviews.isLoading && <PanelSkeleton rows={3} />}
              {reviews.error && <PanelError message={reviews.error} />}
              {activity && (
                <>
                  <div className="dash-counts">
                    <div>
                      <span>{fmt(activity.reviews)}</span>
                      <span className="dash-eyebrow">Reviews</span>
                    </div>
                    <div>
                      <span>{fmt(activity.replies)}</span>
                      <span className="dash-eyebrow">Replies</span>
                    </div>
                    <div>
                      <span>{fmt(activity.helpful)}</span>
                      <span className="dash-eyebrow">Helpful</span>
                    </div>
                  </div>
                  {activity.latest ? (
                    <div className="dash-latest">
                      <span className="dash-eyebrow">Your latest review</span>
                      <div className="dash-card__head">
                        <span className="dash-row__title">
                          {activity.latest.product.name}
                        </span>
                        <span
                          className="dash-stars"
                          aria-label={`${activity.latest.rating} of 5`}
                        >
                          {"★".repeat(activity.latest.rating)}
                          {"☆".repeat(5 - activity.latest.rating)}
                        </span>
                      </div>
                      {activity.latest.title && (
                        <p className="dash-body">{activity.latest.title}</p>
                      )}
                      <span className="dash-muted">
                        {[
                          activity.latest.board &&
                            `Tested on ${activity.latest.board}`,
                          `${activity.latestReplies} ${
                            activity.latestReplies === 1 ? "reply" : "replies"
                          }`,
                          timeAgo(activity.latest.createdAt),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  ) : (
                    <p className="dash-muted">
                      You have replied to reviews but not written one.{" "}
                      <Link href="/community" className="dash-link">
                        Write your first
                      </Link>
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
