/**
 * Faceted filters for the review feed.
 *
 * Deliberately a sibling of `tutorials/FilterRail`, not a reuse of it. Sharing
 * would mean parameterising that component's class prefix and its hardcoded
 * label, which is editing the tutorials screen to serve this one — the thing
 * CLAUDE.md warns against. Two pages with a checkbox list is a coincidence;
 * the honest moment to lift a shared rail is when a third one needs it.
 *
 * Counts are live: each says how many reviews that option would leave once the
 * *other* groups are applied, so a zero tells you the combination is empty
 * before you click it.
 */

import React from "react";

export interface RailOption {
  value: string;
  label: string;
  count: number;
}

export interface RailGroup {
  key: string;
  legend: string;
  options: RailOption[];
}

interface CommunityRailProps {
  groups: RailGroup[];
  selected: Record<string, string[]>;
  onToggle: (groupKey: string, value: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}

const CommunityRail: React.FC<CommunityRailProps> = ({
  groups,
  selected,
  onToggle,
  onClear,
  hasFilters,
}) => (
  <aside className="com-rail" aria-label="Filter reviews">
    {groups.map((group) => (
      <fieldset key={group.key} className="com-rail__group">
        <legend className="com-rail__legend">{group.legend}</legend>

        {group.options.map((option) => {
          const isOn = (selected[group.key] || []).includes(option.value);
          // Dimmed rather than disabled: an option already ticked has to stay
          // clickable so it can be unticked.
          const isEmpty = option.count === 0 && !isOn;

          return (
            <label
              key={option.value}
              className={
                isEmpty ? "com-rail__option com-rail__option--off" : "com-rail__option"
              }
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(group.key, option.value)}
              />
              <span className="com-rail__label">{option.label}</span>
              <span className="com-rail__count">{option.count}</span>
            </label>
          );
        })}
      </fieldset>
    ))}

    {hasFilters && (
      <button type="button" className="com-clear" onClick={onClear}>
        Clear filters
      </button>
    )}
  </aside>
);

export default CommunityRail;
