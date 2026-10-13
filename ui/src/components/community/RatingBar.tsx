/**
 * A rating, as five segments rather than five stars.
 *
 * Stars are the one rounded, organic shape that would appear anywhere in this
 * app. Everything else on a data surface here is a 4px-radius rectangle with a
 * hairline rule — chips, badges, the bill of materials — so the rating is drawn
 * from that same vocabulary instead of imported from every other shop. It also
 * composes: the identical bar carries a single review's score and, at a longer
 * length, the distribution across all of them.
 *
 * The segments are amber because a rating is information on a data surface, and
 * amber is the data accent (DESIGN.md §1). They are paired with the figure
 * itself so the exact value never has to be counted.
 */

import React from "react";

const STEPS = [1, 2, 3, 4, 5];

interface RatingBarProps {
  /** 1–5. Fractional values fill the nearest whole segment. */
  value: number;
  /**
   * The numeral shown beside the bar. Pass `null` on a surface that already
   * states the score in words.
   */
  figure?: string | null;
  /** Names what is being rated, for the accessible label. */
  label?: string;
}

export const RatingBar: React.FC<RatingBarProps> = ({
  value,
  figure,
  label = "Rated",
}) => (
  <span className="com-rating">
    <span
      className="com-rating__track"
      role="img"
      aria-label={`${label} ${value} out of 5`}
    >
      {STEPS.map((step) => (
        <span
          key={step}
          className={
            "com-rating__seg" +
            (step <= Math.round(value) ? " com-rating__seg--on" : "")
          }
        />
      ))}
    </span>
    {figure !== null && (
      <span className="com-rating__figure">{figure ?? value}</span>
    )}
  </span>
);

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Distinguishes the radio group when more than one is on a page. */
  name: string;
}

/** The wording each score carries, so a rating is not left to the reader. */
const MEANING: Record<number, string> = {
  1: "Did not work",
  2: "Poor",
  3: "Does the job",
  4: "Good",
  5: "Would buy again",
};

/**
 * The same bar, as a control.
 *
 * Real radios, visually hidden — that buys arrow-key navigation, a single tab
 * stop, and screen-reader announcement without reimplementing any of it. The
 * fill stays amber because it is the *value being set*; the affordance is
 * carried by the green focus ring and the hover state, so the rule that amber
 * never becomes clickable still holds.
 */
export const RatingInput: React.FC<RatingInputProps> = ({
  value,
  onChange,
  name,
}) => (
  <div className="com-ratinginput">
    <div className="com-ratinginput__track">
      {STEPS.map((step) => (
        <label
          key={step}
          className={
            "com-ratinginput__seg" +
            (step <= value ? " com-ratinginput__seg--on" : "")
          }
          title={`${step} — ${MEANING[step]}`}
        >
          <input
            type="radio"
            name={name}
            value={step}
            checked={value === step}
            onChange={() => onChange(step)}
          />
          <span className="com-visually-hidden">
            {step} out of 5 — {MEANING[step]}
          </span>
        </label>
      ))}
    </div>
    <span className="com-ratinginput__meaning">
      {value > 0 ? MEANING[value] : "Pick a score"}
    </span>
  </div>
);
