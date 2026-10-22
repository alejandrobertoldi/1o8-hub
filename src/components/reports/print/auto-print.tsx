"use client";
import { useEffect } from "react";

/** Generalised from src/app/reports/monthly/print/AutoPrint.tsx. That version
 *  fired on a flat 800ms timer whether or not data had arrived; this one waits
 *  for the [data-report-ready] sentinel and keeps a hard fallback so a stuck
 *  page still prints. */
export function AutoPrint({
  settleMs = 400,
  fallbackMs = 25_000,
  readySelector = "[data-report-ready]",
  waitForFonts = false,
}: {
  settleMs?: number;
  fallbackMs?: number;
  /** The sentinel that marks the page as fully rendered. Reports use [data-report-ready]. */
  readySelector?: string;
  /** Also wait for document.fonts.ready before opening the dialog (case-study decks). */
  waitForFonts?: boolean;
}) {
  useEffect(() => {
    let printed = false;
    let cancelled = false;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      if (printed) return;
      printed = true;
      const fonts = waitForFonts && typeof document !== "undefined" ? document.fonts?.ready : undefined;
      if (!fonts) { window.print(); return; }
      fonts.then(
        () => { if (!cancelled) window.print(); },
        () => { if (!cancelled) window.print(); },
      );
    };
    // Let fonts, images and chart SVGs settle before the dialog opens.
    const fireSoon = () => {
      if (settle) return;
      settle = setTimeout(fire, settleMs);
    };

    const observer = new MutationObserver(() => {
      if (document.querySelector(readySelector)) {
        observer.disconnect();
        fireSoon();
      }
    });

    if (document.querySelector(readySelector)) {
      fireSoon();
    } else {
      // attributes: true matters — a sentinel can be an attribute flipped onto a node that is
      // already mounted (DeckView's data-case-study-ready), which adds no child nodes.
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    }

    const fallback = setTimeout(() => {
      observer.disconnect();
      fire();
    }, fallbackMs);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (settle) clearTimeout(settle);
      clearTimeout(fallback);
    };
  }, [settleMs, fallbackMs, readySelector, waitForFonts]);

  return null;
}
