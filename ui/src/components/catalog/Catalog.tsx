"use client";

/**
 * Catalogue page — the browse surface for the 2,880 scraped products, which
 * until now were reachable only by asking the assistant for them.
 *
 * Filter state lives entirely in the URL query string, so a filtered view is a
 * shareable link, the browser back button works, and the navbar category strip
 * has somewhere real to point.
 */

import React, { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams, useParams } from "next/navigation";

import FilterSidebar from "./FilterSidebar";
import ProductCard from "./ProductCard";
import { useCatalog } from "../../hooks/useCatalog";
import { FACET_KEYS, FacetKey } from "../../types/catalog";
import "../../catalog.css";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "name-asc", label: "Alphabetically, A–Z" },
  { value: "name-desc", label: "Alphabetically, Z–A" },
  { value: "sellers-desc", label: "Most sellers" },
];

/** "SENSORS" in the navbar maps to "Sensors" in the data. */
function categoryFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word === "and" ? "&" : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** 1 … 4 5 [6] 7 8 … 60 — a window around the current page, never all 60. */
function pageWindow(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

  const pages: number[] = [1, count, current];
  for (let offset = 1; offset <= 2; offset += 1) {
    if (current - offset > 1) pages.push(current - offset);
    if (current + offset < count) pages.push(current + offset);
  }

  const ordered = pages
    .filter((page, index) => pages.indexOf(page) === index)
    .sort((a, b) => a - b);
  const withGaps: (number | "gap")[] = [];
  ordered.forEach((page, index) => {
    if (index > 0 && page - (ordered[index - 1] as number) > 1) withGaps.push("gap");
    withGaps.push(page);
  });
  return withGaps;
}

const Catalog: React.FC = () => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { category: categorySlug } = useParams<{ category?: string }>();

  // react-router's setSearchParams, spelled out: push a history entry for the
  // same path with the new query string. `scroll: false` because the
  // catalogue scrolls inside its own `.catalog` container, not the window,
  // and goToPage handles that itself.
  const setSearchParams = (params: URLSearchParams) => {
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // A /catalog/[category] route is just a preset category filter. Resolving it
  // into the query string here means the sidebar, the heading and the fetch all
  // read from one place.
  const effectiveSearch = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    if (categorySlug && !params.has("category")) {
      params.set("category", categoryFromSlug(categorySlug));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [searchParams, categorySlug]);

  const { data, isLoading, error } = useCatalog(effectiveSearch);

  const selected = useMemo(() => {
    const params = new URLSearchParams(effectiveSearch);
    return FACET_KEYS.reduce((acc, key) => {
      acc[key] = params.getAll(key);
      return acc;
    }, {} as Record<FacetKey, string[]>);
  }, [effectiveSearch]);

  const inStockOnly = new URLSearchParams(effectiveSearch).get("inStock") === "true";
  const sort = searchParams.get("sort") || "featured";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const hasAnyFilter =
    inStockOnly || FACET_KEYS.some((key) => selected[key].length > 0);

  /** Every mutation rebuilds the query string and resets to page 1. */
  const update = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(effectiveSearch);
    mutate(params);
    params.delete("page");
    setSearchParams(params);
  };

  const handleToggle = (group: FacetKey, value: string) =>
    update((params) => {
      const current = params.getAll(group);
      params.delete(group);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      next.forEach((v) => params.append(group, v));
    });

  const handleToggleInStock = () =>
    update((params) => {
      if (params.get("inStock") === "true") params.delete("inStock");
      else params.set("inStock", "true");
    });

  const handleClear = () =>
    update((params) => {
      FACET_KEYS.forEach((key) => params.delete(key));
      params.delete("inStock");
    });

  const handleSort = (value: string) =>
    update((params) => {
      if (value === "featured") params.delete("sort");
      else params.set("sort", value);
    });

  // Built from searchParams, not effectiveSearch: on a /catalog/[category] route
  // the category is already carried by the path, and folding it into the query
  // string as well would leave a redundant ?category= on every page link.
  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    setSearchParams(params);
    document.querySelector(".catalog")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const heading = categorySlug
    ? categoryFromSlug(categorySlug)
    : selected.category.length === 1
      ? selected.category[0]
      : "All products";

  const firstOnPage = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastOnPage = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div className="catalog">
      <div className="catalog__inner">
        <div className="catalog__columns">
          {data ? (
            <FilterSidebar
              facets={data.facets}
              selected={selected}
              inStockOnly={inStockOnly}
              onToggle={handleToggle}
              onToggleInStock={handleToggleInStock}
              onClear={handleClear}
              hasAnyFilter={hasAnyFilter}
            />
          ) : (
            <aside className="catalog__sidebar" />
          )}

          <main>
            {/* The breadcrumb is the title's eyebrow, so it lives in the
                results column rather than spanning the page above the
                sidebar, where it read as a sidebar heading. */}
            <nav className="catalog__breadcrumb">
              <Link href="/">Home</Link> / <span>{heading}</span>
            </nav>

            <h1 className="catalog__title">{heading}</h1>

            <div className="catalog__resultbar">
              <p className="catalog__showing">
                {data ? (
                  data.total === 0 ? (
                    "No products"
                  ) : (
                    <>
                      Showing <b>{firstOnPage.toLocaleString("en-US")}</b> –{" "}
                      <b>{lastOnPage.toLocaleString("en-US")}</b> of{" "}
                      <b>{data.total.toLocaleString("en-US")}</b> products
                    </>
                  )
                ) : (
                  "Loading…"
                )}
              </p>

              <div className="catalog__sort">
                <label htmlFor="catalog-sort">Sort by</label>
                <select
                  id="catalog-sort"
                  value={sort}
                  onChange={(event) => handleSort(event.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="catalog__empty">
                <h2>The catalogue is not answering</h2>
                <p>{error}</p>
              </div>
            )}

            {isLoading && (
              <div className="catalog__grid">
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i} className="catalog__skeleton" />
                ))}
              </div>
            )}

            {!isLoading && !error && data && data.total === 0 && (
              <div className="catalog__empty">
                <h2>No products match these filters</h2>
                {/*
                  DESIGN.md section 8: say what happened and what to do next.
                  Naming the narrowest facet is more use than "no results".
                */}
                <p>
                  Try removing the price band, or widening the category — the
                  catalogue only covers five Pakistani suppliers, so some
                  combinations genuinely have nothing behind them.
                </p>
                <button type="button" className="catalog__clear" onClick={handleClear}>
                  Clear all filters
                </button>
              </div>
            )}

            {!isLoading && !error && data && data.total > 0 && (
              <>
                <div className="catalog__grid">
                  {data.products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {data.pageCount > 1 && (
                  <nav className="catalog__pagination" aria-label="Catalogue pages">
                    <button
                      type="button"
                      className="catalog__page"
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1}
                    >
                      Prev
                    </button>

                    {pageWindow(page, data.pageCount).map((entry, index) =>
                      entry === "gap" ? (
                        <span key={`gap-${index}`} className="catalog__ellipsis">
                          …
                        </span>
                      ) : (
                        <button
                          key={entry}
                          type="button"
                          className={`catalog__page${
                            entry === page ? " catalog__page--current" : ""
                          }`}
                          aria-current={entry === page ? "page" : undefined}
                          onClick={() => goToPage(entry)}
                        >
                          {entry}
                        </button>
                      )
                    )}

                    <button
                      type="button"
                      className="catalog__page"
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= data.pageCount}
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Catalog;
