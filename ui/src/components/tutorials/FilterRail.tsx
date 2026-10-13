/**
 * Faceted filters.
 *
 * Counts are live: each one says how many tutorials that option would leave
 * once the *other* groups are applied, so a zero tells you the combination is
 * empty before you click it.
 */

import React from 'react';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface FilterGroup {
  key: string;
  legend: string;
  options: FilterOption[];
}

interface FilterRailProps {
  groups: FilterGroup[];
  /** Selected values, keyed by group. */
  selected: Record<string, string[]>;
  onToggle: (groupKey: string, value: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}

const FilterRail: React.FC<FilterRailProps> = ({
  groups,
  selected,
  onToggle,
  onClear,
  hasFilters,
}) => (
  <aside className="tut-rail" aria-label="Filter tutorials">
    {groups.map((group) => (
      <fieldset key={group.key} className="tut-rail__group">
        <legend className="tut-rail__legend">{group.legend}</legend>

        {group.options.map((option) => {
          const isOn = (selected[group.key] || []).includes(option.value);
          // Dimmed rather than disabled: an option you have already ticked
          // must stay clickable so you can untick it.
          const isEmpty = option.count === 0 && !isOn;

          return (
            <label
              key={option.value}
              className={
                isEmpty ? 'tut-rail__option tut-rail__option--off' : 'tut-rail__option'
              }
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(group.key, option.value)}
              />
              <span className="tut-rail__label">{option.label}</span>
              <span className="tut-rail__count">{option.count}</span>
            </label>
          );
        })}
      </fieldset>
    ))}

    {hasFilters && (
      <button type="button" className="tut-clear" onClick={onClear}>
        Clear filters
      </button>
    )}
  </aside>
);

export default FilterRail;
