/**
 * Tutorials — the editorial layer the source sites do not carry.
 *
 * Structure, and why:
 *
 *   Hero          The claim, then coverage as one mono line. No stat tiles.
 *   Featured      A build with its bill of materials priced from the
 *                 catalogue. This is the page's argument in one card.
 *   Rail + grid   Faceted browse, because chatting is a bad way to find out
 *                 what exists.
 *
 * The library is fetched once from `GET /tutorials` and then filtered,
 * searched and sorted client-side. It is 87 rows, so a round trip per facet
 * tick would cost more than it saves.
 *
 * These tutorials are written by other people and published on RobotShop's
 * community site; we index them, infer their category and level, and price
 * their parts against our own catalogue. Every title links back to the
 * original, and the byline is on every card.
 */

'use client';

import React, { useMemo, useState } from 'react';

import { Tutorial } from '../../types';
import { useTutorials } from '../../hooks/useTutorials';
import FeaturedTutorial from './FeaturedTutorial';
import FilterRail, { FilterGroup } from './FilterRail';
import TutorialCard from './TutorialCard';
import TutorialsSkeleton from './TutorialsSkeleton';
import { FORMAT_LABEL, kitTotal, pricedPartCount } from './format';
import '../../tutorials.css';

type SortKey = 'featured' | 'steps' | 'price';

/** How each filter group reads its values off a tutorial. */
const FACETS: {
  key: string;
  legend: string;
  values: (tutorial: Tutorial) => string[];
  /** Fixed display order where the values are a scale rather than a set. */
  order?: string[];
}[] = [
  {
    key: 'format',
    legend: 'Format',
    values: (t) => [t.format],
    order: ['video', 'course', 'guide', 'wiring'],
  },
  {
    key: 'level',
    legend: 'Level',
    values: (t) => [t.level],
    order: ['Beginner', 'Intermediate', 'Advanced'],
  },
  { key: 'platform', legend: 'Platform', values: (t) => t.platforms },
  { key: 'category', legend: 'Category', values: (t) => [t.category] },
  /* Who wrote it. Worth a facet only because the library stopped being one
     publisher: a RobotShop bench lesson and a ROS course are different kinds
     of thing, and "show me only the courses" is a real way to read this page.
     The rail drops a one-option group, so this disappears again if a build
     ever indexes a single source. */
  { key: 'source', legend: 'Published by', values: (t) => [t.sourceName] },
];

const EMPTY_SELECTION: Record<string, string[]> = {};

/** Free text runs over everything a person might half-remember. */
const searchable = (tutorial: Tutorial): string =>
  [
    tutorial.title,
    tutorial.summary,
    tutorial.category,
    tutorial.level,
    ...tutorial.platforms,
    ...tutorial.parts.map((part) => part.name),
  ]
    .join(' ')
    .toLowerCase();

/**
 * The card that leads the page.
 *
 * There is no editorial "featured" flag any more — nobody here chose these
 * tutorials — so the page picks one. The obvious rule, "most parts", is wrong:
 * it reliably surfaces survey lessons. "Understanding Microcontrollers" names
 * an Arduino, a Raspberry Pi and an ESP32 because it is *comparing* them, and
 * a total that adds all three up describes a purchase nobody would make.
 *
 * So the rule is coherence, not length. One platform means the tutorial builds
 * something rather than weighing options, and a mid-sized list is a real
 * project rather than a catalogue. A thumbnail breaks ties, because the hero
 * is half photograph.
 */
const pickFeatured = (tutorials: Tutorial[]): Tutorial | undefined => {
  const score = (tutorial: Tutorial): number => {
    const parts = pricedPartCount(tutorial);
    if (parts < 3) return -1;
    // Exactly one board. None at all is a component explainer ("what is an
    // inductor"), which has no build to price; more than one means
    // alternatives are being compared, not combined.
    const focused = tutorial.platforms.length === 1 ? 3 : 0;
    // 3–6 lines is a project. Beyond that it is usually an enumeration.
    const sized = parts >= 3 && parts <= 6 ? 3 : 0;
    return focused + sized + (tutorial.image ? 1 : 0);
  };

  return tutorials
    .filter((tutorial) => score(tutorial) > 0)
    .sort((a, b) => score(b) - score(a) || kitTotal(a) - kitTotal(b))[0];
};

const Tutorials: React.FC = () => {
  const { tutorials: allTutorials, isLoading, error } = useTutorials();
  const [selected, setSelected] =
    useState<Record<string, string[]>>(EMPTY_SELECTION);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('featured');

  const trimmedQuery = query.trim().toLowerCase();
  const hasFilters = Object.values(selected).some((v) => v.length > 0);
  const isBrowsing = !hasFilters && trimmedQuery === '';

  const toggle = (groupKey: string, value: string) => {
    setSelected((current) => {
      const group = current[groupKey] || [];
      const next = group.includes(value)
        ? group.filter((v) => v !== value)
        : [...group, value];
      return { ...current, [groupKey]: next };
    });
  };

  const clear = () => {
    setSelected(EMPTY_SELECTION);
    setQuery('');
  };

  /** True when the tutorial satisfies every group except `skipKey`. */
  const matches = useMemo(
    () => (tutorial: Tutorial, skipKey?: string) => {
      if (trimmedQuery && !searchable(tutorial).includes(trimmedQuery)) {
        return false;
      }
      return FACETS.every((facet) => {
        if (facet.key === skipKey) return true;
        const chosen = selected[facet.key] || [];
        if (chosen.length === 0) return true;
        return facet
          .values(tutorial)
          .some((value) => chosen.includes(value));
      });
    },
    [selected, trimmedQuery]
  );

  const results = useMemo(() => {
    const found = allTutorials.filter((tutorial) => matches(tutorial));
    if (sort === 'steps') {
      return [...found].sort((a, b) => a.steps - b.steps);
    }
    if (sort === 'price') {
      return [...found].sort((a, b) => kitTotal(a) - kitTotal(b));
    }
    return found;
  }, [allTutorials, matches, sort]);

  /* Counts are computed against everything *except* the group they sit in, so
     ticking a second box inside one group widens the result rather than
     zeroing its own siblings. */
  const groups: FilterGroup[] = useMemo(
    () =>
      FACETS.map((facet) => {
        const pool = allTutorials.filter((t) => matches(t, facet.key));
        const counts = new Map<string, number>();

        allTutorials.forEach((tutorial) =>
          facet.values(tutorial).forEach((value) => {
            if (!counts.has(value)) counts.set(value, 0);
          })
        );
        pool.forEach((tutorial) =>
          facet.values(tutorial).forEach((value) => {
            counts.set(value, (counts.get(value) || 0) + 1);
          })
        );

        const values = facet.order
          ? facet.order.filter((value) => counts.has(value))
          : Array.from(counts.keys()).sort();

        return {
          key: facet.key,
          legend: facet.legend,
          options: values.map((value) => ({
            value,
            label:
              facet.key === 'format'
                ? FORMAT_LABEL[value as keyof typeof FORMAT_LABEL]
                : value,
            count: counts.get(value) || 0,
          })),
        };
      })
        /* A group with one option is a checkbox that cannot change the result,
           and a legend over nothing at all is the empty label DESIGN.md §5
           rules out. "Published by" is the one that needs this: it is a real
           filter with three publishers in the library and dead weight the day
           a build indexes only one. */
        .filter((group) => group.options.length > 1),
    [allTutorials, matches]
  );

  const featured = useMemo(() => pickFeatured(allTutorials), [allTutorials]);

  const coverage = useMemo(() => {
    const parts = new Set<string>();
    const platforms = new Set<string>();
    const authors = new Set<string>();
    const publishers = new Set<string>();
    allTutorials.forEach((tutorial) => {
      tutorial.parts.forEach((part) => parts.add(part.name));
      tutorial.platforms.forEach((platform) => platforms.add(platform));
      if (tutorial.author) authors.add(tutorial.author);
      publishers.add(tutorial.sourceName);
    });
    return {
      guides: allTutorials.length,
      parts: parts.size,
      platforms: platforms.size,
      authors: authors.size,
      publishers: publishers.size,
      priced: allTutorials.filter((t) => pricedPartCount(t) > 0).length,
    };
  }, [allTutorials]);

  const shown =
    isBrowsing && featured
      ? results.filter((tutorial) => tutorial.id !== featured.id)
      : results;

  /* Three states before the page has anything to show, kept apart because the
     fix is different for each: wait, start the server, or run the scraper.
     A single "no tutorials" would hide which one it is. Waiting gets the
     page's own frame with shimmer where the data goes; the other two get a
     sentence, because there is nothing coming. */
  if (isLoading) return <TutorialsSkeleton />;

  if (error || allTutorials.length === 0) {
    return (
      <main className="tutorials">
        <div className="tut-hero">
          <div className="tut-shell tut-hero__inner">
            <div>
              <h1 className="tut-hero__title">Learn the part before you buy it</h1>
              {error ? (
                <p className="tut-hero__lead">{error}</p>
              ) : (
                <p className="tut-hero__lead">
                  The tutorial library has not been built yet. Run{' '}
                  <code>python run_tutorials.py</code> in <code>scraper/</code>,
                  then restart the mock server and reload this page.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="tutorials">
      {/* Two columns rather than a stack: the claim on the left, the way in on
          the right. The band is held near 115px. A page header earns its
          height by what it does, and this one only names the page and takes a
          search — anything taller is blank space between the navbar and the
          first tutorial. */}
      <div className="tut-hero">
        <div className="tut-shell tut-hero__inner">
          <div>
            <h1 className="tut-hero__title">Learn the part before you buy it</h1>
            <p className="tut-hero__lead">
              Guides and courses from around the web, with every part they name
              matched against this catalogue and priced in rupees.
            </p>
            {/* Coverage as a sentence. It used to be a strip of uppercase
                figures joined by middots, which looks like data and reads like
                decoration. */}
            <p className="tut-hero__coverage">
              <b>{coverage.guides}</b> tutorials from{' '}
              <b>{coverage.publishers}</b>{' '}
              {coverage.publishers === 1 ? 'publisher' : 'publishers'}, covering{' '}
              <b>{coverage.parts}</b> parts across <b>{coverage.platforms}</b>{' '}
              boards.
            </p>
          </div>

          <div className="tut-hero__aside">
            <div className="tut-search">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a part, a board, or a build"
                aria-label="Search tutorials"
              />
            </div>

            {/* Both halves of the provenance, stated plainly. The prices are
                the part we can stand behind; none of the writing is ours and
                the page should never let anyone assume otherwise. Every card
                names its publisher for the same reason. */}
            <p className="tut-hero__note">
              We wrote none of these — each title links back to whoever did.
              Parts and prices are ours; {coverage.priced} of {coverage.guides}{' '}
              have one.
            </p>
          </div>
        </div>
      </div>

      <div className="tut-shell">
        <div className="tut-body">
          <FilterRail
            groups={groups}
            selected={selected}
            onToggle={toggle}
            onClear={clear}
            hasFilters={hasFilters || trimmedQuery !== ''}
          />

          <div>
            {isBrowsing && featured && <FeaturedTutorial tutorial={featured} />}

            <div className="tut-toolbar">
              <p className="tut-toolbar__count">
                <b>{shown.length}</b>{' '}
                {isBrowsing
                  ? shown.length === 1
                    ? 'more tutorial'
                    : 'more tutorials'
                  : shown.length === 1
                  ? 'tutorial matches'
                  : 'tutorials match'}
              </p>

              <label className="tut-sort">
                Sort by
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                >
                  <option value="featured">Featured order</option>
                  <option value="steps">Fewest steps</option>
                  <option value="price">Cheapest kit</option>
                </select>
              </label>
            </div>

            {shown.length > 0 ? (
              <ul className="tut-grid">
                {shown.map((tutorial) => (
                  <TutorialCard key={tutorial.id} tutorial={tutorial} />
                ))}
              </ul>
            ) : (
              /* Says what the library actually holds, rather than "no
                 results" — the gap here is editorial coverage, not a
                 mistyped query. */
              <div className="tut-empty">
                <h3>Nothing published for that combination</h3>
                <p>
                  The library is {coverage.guides} tutorials indexed from the
                  RobotShop community, weighted heavily towards Arduino sensor
                  and actuator work. It is what they wrote, not a catalogue we
                  can extend on request.
                </p>
                <p>
                  Widen the filters, or ask the advisor — it can search the full{' '}
                  catalogue of parts even where no tutorial exists.
                </p>
                <button type="button" className="tut-button" onClick={clear}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default Tutorials;
