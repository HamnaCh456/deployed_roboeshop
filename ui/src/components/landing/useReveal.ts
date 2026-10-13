/**
 * Adds `is-in` to an element the first time it scrolls into view, and says
 * so. The CSS does the rest: `.reveal` starts faded and 14px low,
 * `.reveal.is-in` transitions to rest. One observer per element,
 * disconnected once fired, so a band that has played never plays again on
 * the way back up.
 *
 * Returns `[ref, inView]`. Most bands only need the ref; the numbers band
 * reads `inView` to start counting, and the outcome band to start drawing.
 *
 * Runs only in an effect: the page is prerendered, and the first render must
 * not touch `window`.
 */

import { RefObject, useEffect, useRef, useState } from "react";

export function useReveal<T extends HTMLElement>(
  threshold = 0.2,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fire = () => {
      el.classList.add("is-in");
      setInView(true);
    };
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fire();
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}
