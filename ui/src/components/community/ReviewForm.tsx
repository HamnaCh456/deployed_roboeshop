/**
 * The composer.
 *
 * Ordered the way the review gets written, not the way it gets stored: pick the
 * part, score it, say why, then add the bench detail. The three fields at the
 * bottom — board, time in use, condition on arrival — are the ones that make
 * this a robotics review rather than a generic one, and all three are optional,
 * because a review that skips them is still worth having.
 */

import React, { useEffect, useId, useRef, useState } from "react";

import { ReviewDraft, TaggedProduct } from "../../types/community";
import ProductTagger from "./ProductTagger";
import { RatingInput } from "./RatingBar";

/**
 * Suggested boards when the tagged product names none of its own.
 *
 * Mirrors the platform values `enrich.py` assigns, so a board typed here lines
 * up with the catalogue's own platform facet. The field stays free text — the
 * list is a shortcut, not a closed set.
 */
const COMMON_BOARDS = [
  "Arduino",
  "ESP32",
  "ESP8266",
  "Raspberry Pi",
  "STM32",
  "Micro:bit",
];

const MONTH_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Not saying" },
  { value: "0", label: "Under a month" },
  { value: "1", label: "About a month" },
  { value: "3", label: "About 3 months" },
  { value: "6", label: "About 6 months" },
  { value: "12", label: "About a year" },
  { value: "24", label: "Over 2 years" },
];

const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: "yes", label: "Worked out of the box" },
  { value: "no", label: "Arrived dead" },
  { value: "unsaid", label: "Not saying" },
];

/* Mirrors the check constraint on reviews.body, so the database never rejects
   what the form accepted. The counter under the field reads "21 of 40
   characters" until the minimum is met, so nobody finds out at the button. */
const BODY_MIN = 40;

interface ReviewFormProps {
  /** The signed-in account's display name, shown so the writer knows how the
      review will be signed. The signature itself is applied by the database
      from the session, not from this prop. */
  author: string;
  onSubmit: (draft: ReviewDraft) => Promise<void>;
  onCancel: () => void;
}

interface Errors {
  product?: string;
  rating?: string;
  title?: string;
  body?: string;
}

const ReviewForm: React.FC<ReviewFormProps> = ({
  author,
  onSubmit,
  onCancel,
}) => {
  const [product, setProduct] = useState<TaggedProduct | null>(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [board, setBoard] = useState("");
  const [months, setMonths] = useState("");
  const [condition, setCondition] = useState("unsaid");

  const [errors, setErrors] = useState<Errors>({});
  const [isSaving, setIsSaving] = useState(false);

  const boardListId = useId();
  const panelRef = useRef<HTMLFormElement>(null);

  // Opening the composer should put the reader at the top of it, not leave them
  // wherever the feed was scrolled to.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const bodyLength = body.trim().length;

  /** The tagged part's own platforms first, then the standing list. */
  const boardSuggestions = Array.from(
    new Set([...(product?.platforms ?? []), ...COMMON_BOARDS])
  );

  const validate = (): Errors => {
    const found: Errors = {};
    if (!product) found.product = "Pick the part this review is about.";
    if (rating === 0) found.rating = "Give it a score from 1 to 5.";
    if (title.trim().length < 4) {
      found.title = "Write a headline: one line on how it went.";
    }
    if (body.trim().length < BODY_MIN) {
      found.body = `Say a little more. Reviews need at least ${BODY_MIN} characters so the next person learns something.`;
    }
    return found;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Take the reader to the first thing that needs fixing rather than making
      // them hunt for the red text.
      panelRef.current
        ?.querySelector<HTMLElement>("[aria-invalid='true']")
        ?.focus();
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        product: product as TaggedProduct,
        rating,
        title: title.trim(),
        body: body.trim(),
        board: board.trim(),
        monthsUsed: months === "" ? null : Number(months),
        arrivedWorking:
          condition === "yes" ? true : condition === "no" ? false : null,
      });
    } catch {
      /* The page has already told the reader what went wrong. The job here is
         to leave every field exactly as it was so they can try again. */
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="com-form" ref={panelRef} onSubmit={handleSubmit} noValidate>
      <div className="com-form__head">
        <h2 className="com-form__title">Write a review</h2>
        <p className="com-form__lead">
          Say what you wired it to and how it held up. It will be signed{" "}
          <b>{author}</b> and published as soon as you post it.
        </p>
      </div>

      <div className="com-field">
        <label className="com-label" htmlFor="com-tagger-input">
          The part
        </label>
        <ProductTagger
          value={product}
          onChange={(next) => {
            setProduct(next);
            setErrors((prev) => ({ ...prev, product: undefined }));
          }}
          invalid={Boolean(errors.product)}
        />
        {errors.product ? (
          <p className="com-error">{errors.product}</p>
        ) : (
          <p className="com-hint">
            Searches all 2,880 catalogue products by name, brand and category.
          </p>
        )}
      </div>

      <div className="com-field">
        <span className="com-label">Your score</span>
        <RatingInput name="com-rating" value={rating} onChange={setRating} />
        {errors.rating && <p className="com-error">{errors.rating}</p>}
      </div>

      <div className="com-field">
        <label className="com-label" htmlFor="com-title">
          Headline
        </label>
        <input
          id="com-title"
          className={"com-input" + (errors.title ? " com-input--invalid" : "")}
          type="text"
          maxLength={90}
          value={title}
          aria-invalid={Boolean(errors.title) || undefined}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Accurate to about 2 cm, once I added the pull-up"
        />
        {errors.title && <p className="com-error">{errors.title}</p>}
      </div>

      <div className="com-field">
        <label className="com-label" htmlFor="com-body">
          How it went
        </label>
        <textarea
          id="com-body"
          className={
            "com-input com-input--area" + (errors.body ? " com-input--invalid" : "")
          }
          rows={5}
          maxLength={2000}
          value={body}
          aria-invalid={Boolean(errors.body) || undefined}
          onChange={(event) => setBody(event.target.value)}
          placeholder="How you wired it, what you built with it, and how it held up."
        />
        <div className="com-field__foot">
          {errors.body ? (
            <p className="com-error">{errors.body}</p>
          ) : (
            <p className="com-hint">
              Good or bad, the specifics are what help the next person.
            </p>
          )}
          <span className="com-counter">
            {bodyLength < BODY_MIN
              ? `${bodyLength} of ${BODY_MIN} characters`
              : bodyLength}
          </span>
        </div>
      </div>

      {/* The bench detail. Grouped and labelled as optional so nobody stalls on
          a field they have no answer for. */}
      <fieldset className="com-bench">
        <legend className="com-bench__legend">
          Bench detail <span>optional</span>
        </legend>

        <div className="com-bench__grid">
          <div className="com-field">
            <label className="com-label" htmlFor="com-board">
              Tested on
            </label>
            <input
              id="com-board"
              className="com-input"
              type="text"
              list={boardListId}
              maxLength={40}
              value={board}
              onChange={(event) => setBoard(event.target.value)}
              placeholder="Arduino UNO"
            />
            <datalist id={boardListId}>
              {boardSuggestions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          <div className="com-field">
            <label className="com-label" htmlFor="com-months">
              Time in use
            </label>
            <select
              id="com-months"
              className="com-select"
              value={months}
              onChange={(event) => setMonths(event.target.value)}
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="com-field">
          <span className="com-label">On arrival</span>
          <div className="com-choices">
            {CONDITION_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={
                  "com-choice" +
                  (condition === option.value ? " com-choice--on" : "")
                }
              >
                <input
                  type="radio"
                  name="com-condition"
                  value={option.value}
                  checked={condition === option.value}
                  onChange={() => setCondition(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="com-form__actions">
        <button type="submit" className="com-button" disabled={isSaving}>
          {isSaving ? "Posting…" : "Post review"}
        </button>
        <button type="button" className="com-linkbutton" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;
