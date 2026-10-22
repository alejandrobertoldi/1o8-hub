"use client";
/* eslint-disable react-doctor/nextjs-missing-metadata */

// Chrome-less print route for the case-study PDF export. PDF export is the browser's own
// "Save as PDF": the builder's Export PDF button opens this page with ?autoprint=1, which opens
// the print dialog once the deck's images and fonts have settled. layout-router.tsx renders this
// path with NO TopNav / <main> wrapper, so each 1920×1080 slide prints as exactly one page. In
// print mode every Design image is served as a ~1600px JPEG (see print-image-url.ts) so the PDF
// stays small.

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DeckView } from "@/components/case-study/kit/deck-view";
import { AutoPrint } from "@/components/reports/print/auto-print";
import { printDocumentTitle } from "@/lib/case-study/kit/print-title";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";

export default function CaseStudyPrintPage() {
  const { id } = useParams<{ id: string }>();
  const autoprint = useSearchParams()?.get("autoprint") === "1";
  const [cs, setCs] = useState<KitCaseStudy | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/case-studies/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: KitCaseStudy | null) => { if (!cancelled) setCs(json); })
      .catch(() => { if (!cancelled) setCs(null); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (cs) document.title = printDocumentTitle(cs);
  }, [cs]);

  return (
    <>
      {/* body::before is globals.css's fixed, full-viewport SVG-noise overlay (feTurbulence +
          mix-blend-mode). Save as PDF cannot vectorise it, so Chrome rasterises it onto EVERY page
          as a ~3.4 MB lossless image (measured 2026-09-29: 17 MB of a 5-slide deck). The slides
          cover it completely, so hiding it here changes nothing visible. */}
      <style>{`html,body{margin:0;padding:0;background:#2C2B35;}body::before{display:none;}`}</style>
      {cs ? <DeckView cs={cs} print editing={false} /> : null}
      {/* Mounted only once the deck has loaded: a failed load never opens an empty print dialog. */}
      {cs && autoprint ? <AutoPrint readySelector="[data-case-study-ready]" waitForFonts /> : null}
    </>
  );
}
