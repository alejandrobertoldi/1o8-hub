"use client";
import { useEffect, useState } from "react";
import { Oswald } from "next/font/google";

// Narrow, tall glyphs read like a departures board (SIL OFL — free for commercial use).
const flipFont = Oswald({ subsets: ["latin"], weight: ["600"], display: "swap" });

/** One split-flap tile: dark card, light glyph, a hairline "fold" across the middle (airport departures-board look). */
// "half" tiles stack two-high beside the big ones: 2 × 22px + 4px gap = the 48px (h-12) of a big tile.
const SIZE = {
  half: "h-[22px] min-w-6 px-1 text-sm",
  lg: "h-12 min-w-9 px-1.5 text-3xl",
  digit: "h-12 w-6 text-3xl",
} as const;

function Flap({ ch, size = "lg" }: { ch: string; size?: keyof typeof SIZE }) {
  return (
    <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-[5px] bg-gradient-to-b from-zinc-800 to-zinc-900 ${flipFont.className} leading-none text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.5)] ${SIZE[size]}`}>
      {ch}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-px bg-black/70" />
    </span>
  );
}

const Word = ({ text }: { text: string }) => <div className="flex gap-0.5">{[...text].map((c, i) => <Flap key={i} ch={c} size="digit" />)}</div>;

/** Today's local date (08 OCT · THU/2026) in airport split-flap style; re-checks each minute so it flips at midnight. */
export function FlapClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);

  const dow = now.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const mon = now.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const label = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div role="img" aria-label={label} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
      {/* Departures-board layout: big date digits + month, then weekday over year at half height. */}
      <div className="flex gap-0.5">
        <Word text={String(now.getDate()).padStart(2, "0")} />
        <Flap ch={mon} />
      </div>
      <div className="flex flex-col gap-1">
        <Flap ch={dow} size="half" />
        <Flap ch={String(now.getFullYear())} size="half" />
      </div>
    </div>
  );
}
