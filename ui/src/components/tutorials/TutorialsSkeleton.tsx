/**
 * The tutorials page while the library is still on its way.
 *
 * It is the real page frame, not a message where the page used to be: the
 * hero keeps its title and lead because they do not depend on the data, and
 * only the sentences with numbers in them (coverage, the provenance note)
 * become bars. Below, an empty rail column and nine tiles the shape of the
 * split card, so the grid lands in place when the data does rather than
 * pushing a line of text off the screen.
 *
 * This shows once per tab session. `useTutorials` seeds from `fetchCache`,
 * so the second visit renders the library on its first frame.
 */

import React from 'react';

/** Widths that read as prose rather than a ruler: no two neighbours equal. */
const RAIL_ROWS = [72, 88, 64, 80];
const CARDS = Array.from({ length: 9 }, (_, i) => i);

const TutorialsSkeleton: React.FC = () => (
  <main className="tutorials" aria-busy="true" aria-label="Loading the tutorial library">
    <div className="tut-hero">
      <div className="tut-shell tut-hero__inner">
        <div>
          <h1 className="tut-hero__title">Learn the part before you buy it</h1>
          <p className="tut-hero__lead">
            Guides and courses from around the web, with every part they name
            matched against this catalogue and priced in rupees.
          </p>
          <span className="tut-skeleton tut-skeleton--line" style={{ width: '46%' }} />
        </div>

        <div className="tut-hero__aside">
          <div className="tut-search">
            <input
              type="search"
              disabled
              placeholder="Search a part, a board, or a build"
              aria-label="Search tutorials"
            />
          </div>
          <span className="tut-skeleton-note" aria-hidden="true">
            <span className="tut-skeleton tut-skeleton--line tut-skeleton--note" style={{ width: '94%' }} />
            <span className="tut-skeleton tut-skeleton--line tut-skeleton--note" style={{ width: '44%' }} />
          </span>
        </div>
      </div>
    </div>

    <div className="tut-shell">
      <div className="tut-body">
        <aside className="tut-rail" aria-hidden="true">
          {RAIL_ROWS.map((width, i) => (
            <div key={i} className="tut-skeleton-group">
              <span className="tut-skeleton tut-skeleton--label" style={{ width: `${width}px` }} />
              <span className="tut-skeleton tut-skeleton--line" style={{ width: '70%' }} />
              <span className="tut-skeleton tut-skeleton--line" style={{ width: '56%' }} />
              <span className="tut-skeleton tut-skeleton--line" style={{ width: '62%' }} />
            </div>
          ))}
        </aside>

        <div>
          {/* The featured build comes first on the real page: a two-column
              card with the photo left and the priced parts list right. Its
              outline goes here so the grid below lands where it will stay. */}
          <div className="tut-featured tut-skeleton-featured" aria-hidden="true">
            <div className="tut-skeleton tut-skeleton--featured-media" />
            <div className="tut-featured__body">
              <span className="tut-skeleton tut-skeleton--label" style={{ width: '104px' }} />
              <span className="tut-skeleton tut-skeleton--heading" style={{ width: '78%' }} />
              <span className="tut-skeleton tut-skeleton--line" style={{ width: '38%' }} />
              <span className="tut-skeleton tut-skeleton--line" style={{ width: '96%' }} />
              <span className="tut-skeleton tut-skeleton--line" style={{ width: '92%' }} />
              <span className="tut-skeleton tut-skeleton--line" style={{ width: '60%' }} />
              <span className="tut-skeleton tut-skeleton--panel" />
            </div>
          </div>

          <div className="tut-toolbar">
            <span className="tut-skeleton tut-skeleton--line" style={{ width: '96px' }} />
          </div>

          <ul className="tut-grid" aria-hidden="true">
            {CARDS.map((i) => (
              <li key={i}>
                <div className="tut-skeleton-card">
                  <div className="tut-skeleton tut-skeleton--media" />
                  <div className="tut-skeleton-card__body">
                    <span className="tut-skeleton tut-skeleton--line" style={{ width: '54%' }} />
                    <span className="tut-skeleton tut-skeleton--title" style={{ width: '88%' }} />
                    <span className="tut-skeleton tut-skeleton--line" style={{ width: '72%' }} />
                    <span className="tut-skeleton tut-skeleton--line tut-skeleton--foot" style={{ width: '40%' }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </main>
);

export default TutorialsSkeleton;
