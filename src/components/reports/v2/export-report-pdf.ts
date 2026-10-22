/** Opens the browser print dialog so the user can Save as PDF.
 *  Puppeteer/Lambda PDF is not viable on Vercel (see monthly report route). */

export type ExportReportPdfOpts = {
  clientName?: string;
  sectionLabel?: string;
  start?: string;
  end?: string;
};

function slugPart(value: string): string {
  return value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildReportPdfFilename(opts: ExportReportPdfOpts): string {
  const parts = [
    opts.clientName ? slugPart(opts.clientName) : null,
    opts.sectionLabel ? slugPart(opts.sectionLabel) : "report",
    opts.start && opts.end ? `${opts.start}_${opts.end}` : null,
  ].filter(Boolean);
  return parts.join("_") || "report";
}

export function exportReportPagePdf(opts: ExportReportPdfOpts = {}): void {
  if (typeof window === "undefined") return;

  const prevTitle = document.title;
  document.title = buildReportPdfFilename(opts);
  document.body.classList.add("mf-print-report");

  const main = document.querySelector("main");
  const banner = document.createElement("div");
  banner.id = "mf-print-report-banner";
  banner.setAttribute("data-print-only", "true");
  const range =
    opts.start && opts.end ? `${opts.start} – ${opts.end}` : null;
  banner.innerHTML = [
    opts.clientName ? `<strong>${escapeHtml(opts.clientName)}</strong>` : "",
    opts.sectionLabel ? escapeHtml(opts.sectionLabel) : "",
    range ? `<span>${escapeHtml(range)}</span>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  main?.prepend(banner);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.title = prevTitle;
    document.body.classList.remove("mf-print-report");
    banner.remove();
    window.removeEventListener("afterprint", cleanup);
    window.clearTimeout(fallbackTimer);
  };
  window.addEventListener("afterprint", cleanup);
  // Fallback if afterprint never fires (some browsers)
  const fallbackTimer = window.setTimeout(cleanup, 60_000);
  window.print();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
