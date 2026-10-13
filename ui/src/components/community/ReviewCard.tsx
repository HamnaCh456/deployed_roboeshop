/**
 * One review.
 *
 * The product strip on top is the point of the card. A review floating free is
 * a forum post; a review sitting on the catalogue row it is about — with the
 * photo, the price and how many sellers carry it — is the thing this app can
 * show and a standalone review site cannot.
 *
 * The price is the one the reviewer saw. It is labelled as such rather than
 * refreshed, because a review is a snapshot: quietly updating it to today's
 * figure would put a number in someone's mouth they never quoted.
 */

import React from "react";

import { Review } from "../../types/community";
import { RatingBar } from "./RatingBar";
import { exactDate, groupDigits, priceUnit, timeAgo, useLabel } from "./format";

interface ReviewCardProps {
  review: Review;
  /** The signed-in account has already voted it helpful. */
  voted: boolean;
  /** The signed-in account wrote it, so it may take it back. */
  own: boolean;
  /** Signed in. Voting is writing, and writing needs an account. */
  canVote: boolean;
  /** Replies on this review's thread, for the toggle's count. */
  replyCount: number;
  /** This card's thread is the open one. At most one is, page-wide. */
  threadOpen: boolean;
  /** The thread itself, rendered by the page so the card stays presentational. */
  thread?: React.ReactNode;
  onToggleThread: (id: string) => void;
  onHelpful: (id: string) => void;
  onDelete: (id: string) => void;
}

const ReviewCard: React.FC<ReviewCardProps> = ({
  review,
  voted,
  own,
  canVote,
  replyCount,
  threadOpen,
  thread,
  onToggleThread,
  onHelpful,
  onDelete,
}) => {
  const { product } = review;
  const timeChip = useLabel(review.monthsUsed);

  return (
    <article className="com-review">
      <div className="com-review__product">
        <span className="com-review__thumb">
          {product.image ? (
            <img src={product.image} alt="" loading="lazy" />
          ) : (
            <span>No photo</span>
          )}
        </span>

        <span className="com-review__producttext">
          <span className="com-review__brand">
            {product.brand || product.category}
          </span>
          <a
            className="com-review__productname"
            href={product.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            {product.name}
          </a>
        </span>

        <span className="com-review__price">
          <span className="com-unit">{priceUnit(product.currency)}</span>
          {groupDigits(product.price)}
          {product.offerCount > 1 && (
            <span className="com-review__sellers">
              {product.offerCount} sellers
            </span>
          )}
        </span>
      </div>

      <div className="com-review__body">
        <div className="com-review__verdict">
          <RatingBar value={review.rating} label={product.name} />
          <h3 className="com-review__title">{review.title}</h3>
        </div>

        <p className="com-review__text">{review.body}</p>

        {(review.board || timeChip || review.arrivedWorking === false) && (
          <ul className="com-review__chips">
            {review.board && (
              <li className="com-chip">Tested on {review.board}</li>
            )}
            {timeChip && <li className="com-chip">{timeChip}</li>}
            {/*
              Only the dead-on-arrival case gets a chip. "Worked out of the box"
              is the expected outcome, so a chip for it would sit on nearly every
              card and carry no information — the same reason the tutorials card
              dropped its verified badge. The positive answers are still stored,
              because the hero's DOA rate needs them as its denominator.
            */}
            {review.arrivedWorking === false && (
              <li className="com-chip com-chip--dead">Arrived dead</li>
            )}
          </ul>
        )}

        <div className="com-review__foot">
          <p className="com-review__by">
            <b>{review.author}</b>
            <span aria-hidden="true"> · </span>
            <time dateTime={review.createdAt} title={exactDate(review.createdAt)}>
              {timeAgo(review.createdAt)}
            </time>
          </p>

          <div className="com-review__actions">
            {/* The way into the discussion, and its size, are the same control.
                Two — a "Reply" button beside a "3 replies" link — would be two
                doors into one room. */}
            <button
              type="button"
              className={
                "com-threadtoggle" +
                (threadOpen ? " com-threadtoggle--on" : "")
              }
              onClick={() => onToggleThread(review.id)}
              aria-expanded={threadOpen}
              aria-controls={`com-thread-${review.id}`}
            >
              {replyCount === 0 ? (
                "Reply"
              ) : (
                <>
                  <span className="com-threadtoggle__count">{replyCount}</span>{" "}
                  {replyCount === 1 ? "reply" : "replies"}
                </>
              )}
            </button>

            {own && (
              <button
                type="button"
                className="com-linkbutton com-linkbutton--quiet"
                onClick={() => onDelete(review.id)}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className={"com-helpful" + (voted ? " com-helpful--on" : "")}
              onClick={() => onHelpful(review.id)}
              disabled={voted || !canVote}
              aria-pressed={voted}
              title={canVote ? undefined : "Sign in to mark reviews helpful"}
            >
              {voted ? "Marked helpful" : "Helpful"}
              {review.helpful > 0 && (
                <span className="com-helpful__count">{review.helpful}</span>
              )}
            </button>
          </div>
        </div>

        {/* Inside the card, not after it: the thread is part of the review it
            answers, and a panel floating below would read as a second post. */}
        {threadOpen && thread}
      </div>
    </article>
  );
};

export default ReviewCard;
