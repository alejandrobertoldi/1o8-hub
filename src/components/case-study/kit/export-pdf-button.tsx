"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Stage } from "@/lib/case-study/kit/stages";

/**
 * PDF export = the browser's own "Save as PDF" from the chrome-less print page (Manu's ruling,
 * 2026-09-29 — a server-side Puppeteer PDF embedded ~39 full-resolution images, 43–91 MB, far
 * past Vercel's 4.5 MB function response cap). Opens /case-studies/<id>/print?autoprint=1 in a
 * new tab; an Approved deck is first moved to Sent via the existing PATCH transition.
 *
 * The tab is opened synchronously inside the click (before the PATCH is awaited) so popup
 * blockers still see a user gesture; it is navigated once the PATCH succeeds and closed if it
 * fails.
 */
export function ExportPdfButton({
  caseStudyId,
  stage,
  onExported,
  onError,
}: {
  caseStudyId: string;
  stage: Stage;
  onExported: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const canExport = stage === "approved" || stage === "sent";
  const printUrl = `/case-studies/${encodeURIComponent(caseStudyId)}/print?autoprint=1`;

  const handleClick = async () => {
    if (!canExport || busy) return;
    if (stage !== "approved") {
      window.open(printUrl, "_blank", "noopener");
      return;
    }
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const res = await fetch(`/api/case-studies/${encodeURIComponent(caseStudyId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "sent" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        tab?.close();
        onError(json?.error ?? "Couldn't mark the deck as sent — PDF not exported.");
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = printUrl;
      } else {
        window.open(printUrl, "_blank", "noopener");
      }
      await onExported();
    } catch {
      tab?.close();
      onError("Couldn't mark the deck as sent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={!canExport || busy}
      title={!canExport ? "Approve the deck first" : undefined}
    >
      <Download className="w-4 h-4 mr-1" /> Export PDF
    </Button>
  );
}
