/**
 * The discussion under one review.
 *
 * One review, one thread, and the thread is flat. A reply never opens a thread
 * of its own — answering a particular person puts `@their-name` at the front of
 * the box and the answer stays in the same column as everything else. Nesting
 * is what splits one conversation about one part into several, and the useful
 * answer ends up down a branch nobody expanded.
 *
 * Only one thread on the page is open at a time; the page owns that, not this
 * component. What is typed survives closing it, because the draft is held by
 * the page too — see `drafts` in Community.tsx. Losing a half-written reply to
 * a mis-click on another card would be the page punishing you for its own rule.
 */

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

import { Reply, ReplyDraft } from "../../types/community";
import { exactDate, timeAgo } from "./format";

/* Long enough to be an answer, short enough that "yes, same here" gets through.
   The review composer asks for 40 — a reply is a remark, not a bench report. */
const BODY_MIN = 2;
const BODY_MAX = 600;

interface ReplyThreadProps {
  reviewId: string;
  /** The whole thread, oldest first. */
  replies: Reply[];
  /** Ids written by the signed-in account, so they can be taken back. */
  ownIds: Set<string>;
  /** The signed-in account's display name, for the "Posting as" hint. The
      database signs the row from the session, not from this prop. */
  author: string;
  /** False while signed out: the thread reads, but the box is a sign-in link. */
  canWrite: boolean;
  /** Draft text, held by the page so it survives the thread being closed. */
  draft: string;
  onDraftChange: (reviewId: string, text: string) => void;
  onSubmit: (draft: ReplyDraft) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const ReplyThread: React.FC<ReplyThreadProps> = ({
  reviewId,
  replies,
  ownIds,
  author,
  canWrite,
  draft,
  onDraftChange,
  onSubmit,
  onDelete,
  onClose,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Opening a thread is an intent to read it or write in it, so the caret is
  // already in the box. There is only ever one open, so this cannot fight
  // another thread for focus. Signed out there is no box to focus.
  useEffect(() => {
    if (canWrite) boxRef.current?.focus({ preventScroll: true });
  }, [canWrite]);

  /** Addressing someone keeps the thread flat: a mention, not a sub-thread. */
  const mention = (name: string) => {
    const tag = `@${name} `;
    onDraftChange(reviewId, draft.startsWith(tag) ? draft : tag + draft);
    boxRef.current?.focus();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const body = draft.trim();
    if (body.length < BODY_MIN) {
      setError("Write something first.");
      boxRef.current?.focus();
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSubmit({ reviewId, body });
      onDraftChange(reviewId, "");
    } catch {
      /* Reported by the page. The draft is left in the box on purpose. */
    } finally {
      setIsSaving(false);
    }
  };

  const remaining = BODY_MAX - draft.length;

  return (
    <div className="com-thread" id={`com-thread-${reviewId}`}>
      {replies.length > 0 ? (
        <ol className="com-thread__list">
          {replies.map((reply) => (
            <li className="com-reply" key={reply.id}>
              <p className="com-reply__by">
                <b>{reply.author}</b>
                <span aria-hidden="true"> · </span>
                <time
                  dateTime={reply.createdAt}
                  title={exactDate(reply.createdAt)}
                >
                  {timeAgo(reply.createdAt)}
                </time>
              </p>

              <p className="com-reply__text">{reply.body}</p>

              <div className="com-reply__actions">
                <button
                  type="button"
                  className="com-linkbutton com-linkbutton--quiet"
                  onClick={() => mention(reply.author)}
                >
                  Reply to {reply.author}
                </button>
                {ownIds.has(reply.id) && (
                  <button
                    type="button"
                    className="com-linkbutton com-linkbutton--quiet"
                    onClick={() => onDelete(reply.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        /* Not "no replies" — says what belongs here (DESIGN.md §8). */
        <p className="com-thread__empty">
          No replies yet. Ask what board they wired it to, or say whether it
          behaved the same for you.
        </p>
      )}

      {canWrite ? (
        <form className="com-replyform" onSubmit={handleSubmit} noValidate>
          <textarea
            ref={boxRef}
            className="com-input com-replyform__box"
            value={draft}
            maxLength={BODY_MAX}
            rows={2}
            placeholder="Add to this thread"
            aria-label="Your reply"
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              onDraftChange(reviewId, event.target.value);
              if (error) setError(null);
            }}
          />

          <div className="com-replyform__foot">
            <p className="com-hint">
              Posting as <b>{author}</b>
            </p>

            <div className="com-replyform__actions">
              {/* Only shown once it could matter, rather than counting from 600
                  the moment the box is empty. */}
              {remaining <= 100 && (
                <span className="com-counter">{remaining} left</span>
              )}
              <button
                type="button"
                className="com-linkbutton com-linkbutton--quiet"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="submit"
                className="com-button com-button--compact"
                disabled={isSaving}
              >
                {isSaving ? "Posting…" : "Post reply"}
              </button>
            </div>
          </div>

          {error && <p className="com-error">{error}</p>}
        </form>
      ) : (
        /* Reading is open to everyone; adding to the thread is not. The link
           carries the page so sign-in comes straight back here. */
        <div className="com-replyform__foot">
          <p className="com-hint">
            <Link className="com-linkbutton" href="/auth/login?next=/community">
              Sign in to reply
            </Link>
          </p>
          <button
            type="button"
            className="com-linkbutton com-linkbutton--quiet"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default ReplyThread;
