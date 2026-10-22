"use client";
import type { JSX } from "react";
import { deckSections, slideDef } from "@/lib/case-study/kit/slides";
import type { KitSection } from "@/lib/case-study/kit/types";

/** Builder-only jump strip: one numbered button per slide, labelled from the slide catalog.
 *  Clicking scrolls DeckView's wrapper for that section (`data-section-id`) into view. */
export function SlideStrip({ sections }: { sections: KitSection[] }): JSX.Element | null {
  const ordered = deckSections(sections);
  if (ordered.length === 0) return null;
  const jump = (id: string) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-section-id]")).find((n) => n.dataset.sectionId === id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <nav aria-label="Slides" className="flex gap-2 overflow-x-auto px-6 py-2 border-b bg-card print:hidden">
      {ordered.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onClick={() => jump(s.id)}
          className="shrink-0 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="font-semibold tabular-nums">{i + 1}</span> {slideDef(s.sectionType).label}
        </button>
      ))}
    </nav>
  );
}
