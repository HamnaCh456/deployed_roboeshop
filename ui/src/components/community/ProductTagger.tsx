/**
 * Tag the product a review is about.
 *
 * This is the one control on the page that has to be good. A review with no
 * product attached is a forum post; a review attached to a catalogue row is a
 * fact about hardware someone can go and buy, which is the whole reason this
 * page sits inside a marketplace rather than beside one.
 *
 * Standard combobox wiring: real listbox roles, arrow keys, Escape to dismiss,
 * and `aria-activedescendant` so the focus stays in the text field while the
 * highlight moves down the list.
 */

import React, { useEffect, useId, useRef, useState } from "react";

import { CatalogProduct } from "../../types/catalog";
import { TaggedProduct } from "../../types/community";
import { useProductSearch } from "../../hooks/useProductSearch";
import { groupDigits, priceUnit } from "./format";

/** The catalogue row, narrowed to what a review needs to keep for good. */
export const toTagged = (product: CatalogProduct): TaggedProduct => ({
  id: product.id,
  name: product.name,
  brand: product.brand,
  category: product.category,
  image: product.image,
  price: product.price,
  currency: product.currency,
  offerCount: product.offerCount,
  sourceUrl: product.sourceUrl,
  platforms: product.platforms,
});

interface ProductTaggerProps {
  value: TaggedProduct | null;
  onChange: (product: TaggedProduct | null) => void;
  /** Set after a failed submit, so the field can point at itself. */
  invalid?: boolean;
}

const ProductTagger: React.FC<ProductTaggerProps> = ({
  value,
  onChange,
  invalid = false,
}) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const { results, isSearching, error } = useProductSearch(query);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A new result set invalidates whatever row was highlighted in the old one.
  useEffect(() => setHighlight(0), [results]);

  // Clicking anywhere else dismisses the list. Pointer-down rather than click,
  // so the list is gone before the next control takes focus.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const choose = (product: CatalogProduct) => {
    onChange(toTagged(product));
    setQuery("");
    setIsOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery("");
    // Focus lands back where the next action is, rather than on the body.
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (!isOpen || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      // Otherwise Enter submits the form with a half-finished search in the box.
      event.preventDefault();
      choose(results[highlight]);
    }
  };

  if (value) {
    return (
      <div className="com-tagged">
        <div className="com-tagged__media">
          {value.image ? (
            <img src={value.image} alt="" loading="lazy" />
          ) : (
            <span>No photo</span>
          )}
        </div>

        <div className="com-tagged__body">
          <p className="com-tagged__brand">{value.brand || value.category}</p>
          <p className="com-tagged__name">{value.name}</p>
          <p className="com-tagged__price">
            <span className="com-unit">{priceUnit(value.currency)}</span>
            {groupDigits(value.price)}
            {value.offerCount > 1 && (
              <span className="com-tagged__sellers">
                {value.offerCount} sellers
              </span>
            )}
          </p>
        </div>

        <button type="button" className="com-linkbutton" onClick={clear}>
          Change part
        </button>
      </div>
    );
  }

  const showList = isOpen && query.trim().length >= 2;

  /*
   * The placeholder examples are checked against the live catalogue, and that
   * matters more than it looks: `q` on the server is a plain substring match
   * over name, brand and category, so a part code written with the wrong
   * separator finds nothing at all — "HC-SR04" misses the product listed as
   * "HC SR04". Suggesting a query that returns zero results is the fastest way
   * to make a working search look broken.
   */
  return (
    <div className="com-tagger" ref={wrapRef}>
      <input
        ref={inputRef}
        id="com-tagger-input"
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={
          showList && results.length > 0 ? `${listId}-${highlight}` : undefined
        }
        aria-invalid={invalid || undefined}
        className={"com-input" + (invalid ? " com-input--invalid" : "")}
        placeholder="Search the catalogue — ultrasonic, L298N, ESP32…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showList && (
        <div className="com-tagger__panel">
          {error ? (
            <p className="com-tagger__note">{error}</p>
          ) : results.length > 0 ? (
            <ul className="com-tagger__list" id={listId} role="listbox">
              {results.map((product, index) => (
                <li
                  key={product.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  className={
                    "com-tagger__option" +
                    (index === highlight ? " com-tagger__option--on" : "")
                  }
                  onPointerEnter={() => setHighlight(index)}
                  onClick={() => choose(product)}
                >
                  <span className="com-tagger__thumb">
                    {product.image ? (
                      <img src={product.image} alt="" loading="lazy" />
                    ) : null}
                  </span>
                  <span className="com-tagger__text">
                    <span className="com-tagger__name">{product.name}</span>
                    <span className="com-tagger__meta">
                      {product.brand || product.category}
                    </span>
                  </span>
                  <span className="com-tagger__price">
                    <span className="com-unit">
                      {priceUnit(product.currency)}
                    </span>
                    {groupDigits(product.price)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="com-tagger__note">
              {isSearching
                ? "Searching the catalogue…"
                : `Nothing in the catalogue matches “${query.trim()}”. The crawl covers five stores, so a part sold elsewhere will not be here yet.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductTagger;
