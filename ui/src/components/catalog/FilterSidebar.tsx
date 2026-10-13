/**
 * Faceted filter sidebar.
 *
 * Every option carries its result count, which the reference research calls the
 * single highest-impact filter improvement — with 2,880 products spread very
 * unevenly (Prototyping 772, Robots 15) it is the only way to tell which facets
 * are worth opening.
 *
 * Counts come from the server, which deliberately computes each group against
 * all the *other* filters rather than its own. Ticking "Sensors" must not make
 * every sibling category read 0.
 */

import React from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { CatalogFacets, FacetKey, FacetOption } from "../../types/catalog";

interface FilterSidebarProps {
  facets: CatalogFacets;
  selected: Record<FacetKey, string[]>;
  inStockOnly: boolean;
  onToggle: (group: FacetKey, value: string) => void;
  onToggleInStock: () => void;
  onClear: () => void;
  hasAnyFilter: boolean;
}

interface FacetGroupProps {
  title: string;
  options: FacetOption[];
  chosen: string[];
  onToggle: (value: string) => void;
  /** Longer lists start collapsed so the sidebar stays scannable. */
  defaultOpen?: boolean;
}

const FacetGroup: React.FC<FacetGroupProps> = ({
  title,
  options,
  chosen,
  onToggle,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  if (options.length === 0) return null;

  return (
    <div className="facet">
      <button
        type="button"
        className="facet__heading"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {title}
        <ExpandMoreIcon
          fontSize="small"
          className={`facet__chevron${isOpen ? " facet__chevron--open" : ""}`}
        />
      </button>

      {isOpen && (
        <ul className="facet__list">
          {options.map((option) => {
            const isChosen = chosen.includes(option.value);
            // A zero-count option is only reachable if it is already ticked.
            const isEmpty = option.count === 0 && !isChosen;

            return (
              <li key={option.value}>
                <label
                  className={`facet__option${isEmpty ? " facet__option--empty" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="facet__checkbox"
                    checked={isChosen}
                    disabled={isEmpty}
                    onChange={() => onToggle(option.value)}
                  />
                  <span className="facet__label" title={option.label || option.value}>
                    {option.label || option.value}
                  </span>
                  <span className="facet__count">{option.count.toLocaleString("en-US")}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const FilterSidebar: React.FC<FilterSidebarProps> = ({
  facets,
  selected,
  inStockOnly,
  onToggle,
  onToggleInStock,
  onClear,
  hasAnyFilter,
}) => (
  <aside className="catalog__sidebar">
    <FacetGroup
      title="Category"
      options={facets.category}
      chosen={selected.category}
      onToggle={(value) => onToggle("category", value)}
    />

    <FacetGroup
      title="Price"
      options={facets.price}
      chosen={selected.price}
      onToggle={(value) => onToggle("price", value)}
    />

    <FacetGroup
      title="Platform"
      options={facets.platform}
      chosen={selected.platform}
      onToggle={(value) => onToggle("platform", value)}
    />

    <FacetGroup
      title="Skill level"
      options={facets.skill}
      chosen={selected.skill}
      onToggle={(value) => onToggle("skill", value)}
    />

    <div className="facet">
      <ul className="facet__list" style={{ marginTop: 0 }}>
        <li>
          <label className="facet__option">
            <input
              type="checkbox"
              className="facet__checkbox"
              checked={inStockOnly}
              onChange={onToggleInStock}
            />
            <span className="facet__label">In stock only</span>
            <span className="facet__count">{facets.inStock.toLocaleString("en-US")}</span>
          </label>
        </li>
      </ul>
    </div>

    {hasAnyFilter && (
      <button type="button" className="catalog__clear" onClick={onClear}>
        Clear all filters
      </button>
    )}
  </aside>
);

export default FilterSidebar;
