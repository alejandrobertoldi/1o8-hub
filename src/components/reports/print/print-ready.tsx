"use client";
import { useEffect, useState } from "react";

/** Emits the [data-report-ready] sentinel a print consumer waits on.
 *
 *  Readiness is detected generically: every v2 section renders its loading state
 *  as an element carrying Tailwind's `animate-pulse`, so "no pulse anywhere"
 *  means every fetch on the page has settled. This needs no per-section wiring
 *  and works identically for all six sections. It queries the CLASS, not the
 *  running animation, so prefers-reduced-motion cannot affect it.
 *
 *  The timeout is deliberate: a stuck Redshift query must still yield a printable
 *  document rather than a page that never prints. */
export function PrintReady({ timeoutMs = 20_000 }: { timeoutMs?: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const deadline = Date.now() + timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const pending = document.querySelectorAll(".animate-pulse").length;
      if (pending === 0 || Date.now() >= deadline) {
        setReady(true);
        return;
      }
      timer = setTimeout(tick, 250);
    };
    timer = setTimeout(tick, 250);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [ready, timeoutMs]);

  return ready ? <div data-report-ready="true" /> : null;
}
