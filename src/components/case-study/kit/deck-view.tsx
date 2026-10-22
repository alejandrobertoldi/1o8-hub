"use client";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Outfit } from "next/font/google";
import "./deck.css";
import { DeckContext, formatPeriod, type SlideComponent } from "./primitives";
import { HL_RENDERERS } from "./slides-hl";
import { DETAILED_A } from "./slides-detailed-a";
import { DETAILED_B } from "./slides-detailed-b";
import { DETAILED_C } from "./slides-detailed-c";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";
import { effective, deriveMetrics } from "@/lib/case-study/kit/metrics";
import { usdExact } from "@/lib/case-study/kit/display";
import { deckSections, type SlideType } from "@/lib/case-study/kit/slides";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"] });

export const RENDERERS: Record<SlideType, SlideComponent> = {
  ...HL_RENDERERS,
  ...DETAILED_A,
  ...DETAILED_B,
  ...DETAILED_C,
} as Record<SlideType, SlideComponent>;

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

function ScaledSlide({ children, sectionId, editing, onEditPencil }: { children: JSX.Element; sectionId: string; editing: boolean; onEditPencil?: () => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / STAGE_WIDTH);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="cs-slide-wrapper" data-section-id={sectionId} style={{ position: "relative", width: "100%", height: STAGE_HEIGHT * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: STAGE_WIDTH, height: STAGE_HEIGHT }}>
        {children}
      </div>
      {editing && (
        <button
          type="button"
          data-edit-pencil
          aria-label="Edit slide"
          onClick={onEditPencil}
          style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
        >
          ✏️
        </button>
      )}
    </div>
  );
}

export function DeckView({
  cs,
  editing,
  print,
  onEditSlide,
}: {
  cs: KitCaseStudy;
  editing: boolean;
  print?: boolean;
  onEditSlide?: (sectionId: string) => void;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const e = useMemo(() => effective(cs.metrics), [cs.metrics]);
  const d = useMemo(() => deriveMetrics(e), [e]);
  const period = useMemo(() => formatPeriod(cs.dateRangeStart, cs.dateRangeEnd), [cs.dateRangeStart, cs.dateRangeEnd]);
  const periodShort = cs.dateRangeEnd.slice(0, 4);

  const tokens = useMemo(() => {
    const base: Record<string, string> = { client: cs.clientName, period };
    if (cs.format === "detailed") base.total = usdExact(e.salesTotal);
    return base;
  }, [cs.clientName, cs.format, period, e.salesTotal]);

  // Legacy rows (old 13-section builder types) have no renderer — skip them rather than crash.
  const sections = useMemo(() => deckSections(cs.sections), [cs.sections]);

  // A stable signature of every section's resolved content-image sources. Used as the readiness
  // effect's dependency instead of sections.length: a same-length section swap (different section
  // id at the same slot, or a changed Design/manual image URL) must reset readiness, since the new
  // image set has not settled yet even though the count of sections is unchanged.
  const imageSignature = useMemo(
    () => sections.map((s) => `${s.id}:${JSON.stringify(s.content.designImages)}:${JSON.stringify(s.content.manualImages)}`).join("|"),
    [sections],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      // Intentional synchronous set: readiness must be decided in the same commit as the DOM it
      // inspects (the PDF export waits on data-case-study-ready), and it only runs when the image
      // signature changes, so there is no render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    // Scope readiness to dynamically-loaded content images (Design/manual photos inside a
    // SlotImage, marked with data-slot). Static brand-chrome assets (mf-logo/mf-mark, bundled
    // with the app) are excluded: they are always instantly available and jsdom never fires
    // their load/error events at all, which would otherwise make readiness unreachable in tests.
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("[data-slot] img"));
    if (imgs.length === 0) {
      setReady(true);
      return;
    }

    // An <img> that is already `complete` (served from cache, or resolved synchronously before
    // this effect runs) will NOT fire another `load`/`error` event — listening only is not enough,
    // or readiness would never resolve for cached images, hanging any consumer (e.g. PDF export)
    // that waits on data-case-study-ready. jsdom cannot exercise this path: it never marks an
    // <img> `complete` and never dispatches load/error at all, so this branch is untested here —
    // do not "simplify" it away as unreachable.
    let settled = 0;
    const unsettled: HTMLImageElement[] = [];
    for (const img of imgs) {
      if (img.complete) settled += 1;
      else unsettled.push(img);
    }
    if (settled >= imgs.length) {
      setReady(true);
      return;
    }

    setReady(false);
    let remaining = imgs.length - settled;
    const onSettle = () => {
      remaining -= 1;
      if (remaining <= 0) setReady(true);
    };
    for (const img of unsettled) {
      img.addEventListener("load", onSettle);
      img.addEventListener("error", onSettle);
    }
    return () => {
      for (const img of unsettled) {
        img.removeEventListener("load", onSettle);
        img.removeEventListener("error", onSettle);
      }
    };
  }, [imageSignature]);

  return (
    <div ref={rootRef} className={`cs-deck ${outfit.className}`} data-case-study-ready={ready ? "" : undefined}>
      {sections.map((section, index) => {
        const Renderer = RENDERERS[section.sectionType];
        const ctx = {
          format: cs.format,
          clientName: cs.clientName,
          period,
          periodShort,
          contactEmail: cs.contactEmail,
          editing,
          slideNo: index + 1,
          slideTotal: sections.length,
          tokens,
          print: Boolean(print),
        };
        const slide = (
          <DeckContext.Provider value={ctx}>
            <Renderer content={section.content} e={e} d={d} />
          </DeckContext.Provider>
        );
        if (print) {
          return (
            // No break after the last slide, or the browser emits a blank trailing page.
            <div key={section.id} className="cs-print-slide" data-section-id={section.id} style={index < sections.length - 1 ? { breakAfter: "page" } : undefined}>
              {slide}
            </div>
          );
        }
        return (
          <ScaledSlide key={section.id} sectionId={section.id} editing={editing} onEditPencil={() => onEditSlide?.(section.id)}>
            {slide}
          </ScaledSlide>
        );
      })}
    </div>
  );
}
