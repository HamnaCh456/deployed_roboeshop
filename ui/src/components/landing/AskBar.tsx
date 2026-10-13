"use client";

/**
 * The slim ask bar: 48px, hairline ring, a `⌘K` hint and a search glyph at
 * the end, no button. Proportions are Kokonut UI's Action Search Bar; the
 * tokens are DESIGN.md's. Submitting hands the question to the assistant at
 * `/assistant?q=`, which sends it as the first message.
 *
 * `⌘K` focuses the bar from anywhere on the page, so the hint is true.
 */

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface AskBarProps {
  placeholder: string;
  /** Registers the ⌘K / Ctrl+K shortcut. Only one bar on a page should. */
  hotkey?: boolean;
  /** The hero bar is on a photo, the closing bar is on ink; both are white. */
  label: string;
}

const AskBar: React.FC<AskBarProps> = ({ placeholder, hotkey = false, label }) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/assistant?q=${encodeURIComponent(q)}` : "/assistant");
  };

  return (
    <form className="ask" onSubmit={submit} role="search" aria-label={label}>
      <input
        ref={inputRef}
        className="ask__input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {hotkey && (
        <kbd className="ask__kbd" aria-hidden="true">
          ⌘K
        </kbd>
      )}
      <button type="submit" className="ask__go" aria-label="Ask Servo">
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </form>
  );
};

export default AskBar;
