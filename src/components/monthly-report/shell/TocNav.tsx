/* eslint-disable react-doctor/js-combine-iterations */
import React from 'react';
import type { Report, SectionId } from '../types';

const LABELS: Record<SectionId, string> = {
  cover:       'Cover',
  toc:         'Contents',
  execSummary: 'Executive summary',
  kpis:        'Key metrics',
  campaigns:   'Campaign Manager',
  mom:         'Month-over-month',
  highlights:  'Findings',
  risks:       'Scorecard',
  channels:    'Channels',
  products:    'Products',
  financials:  'Financials',
  team:        'Team',
  goals:       'Directions',
  appendix:    'Appendix',
};

/**
 * Returns true if the section's backing data is present and non-empty.
 * A section that's listed in data.sections but has no backing data should
 * not produce a dangling anchor — render-time defense for the orchestrator's
 * own filtering in build-report-data.ts.
 */
function hasBackingData(data: Report, id: SectionId): boolean {
  switch (id) {
    case 'kpis':        return (data.kpis ?? []).length > 0;
    case 'campaigns':   return !!data.campaigns;
    case 'mom':         return !!data.mom;
    case 'highlights':  return (data.highlights ?? []).length > 0;
    case 'goals':       return (data.goals ?? []).length > 0;
    case 'risks':       return (data.risks ?? []).length > 0;
    case 'products':    return (data.products ?? []).length > 0;
    case 'appendix':    return false;
    case 'execSummary': return !!data.execSummary;
    case 'channels':    return (data.channels ?? []).length > 0;
    case 'financials':  return !!data.financials;
    case 'team':        return (data.team ?? []).length > 0;
    case 'cover':
    case 'toc':         return true; // never filtered here
  }
}

/** Hash links don't scroll `main#main-content` (the real overflow). Jump it ourselves. */
function scrollReportTo(id: string) {
  const target = document.getElementById(id);
  const scroller = document.getElementById("main-content");
  if (!target) return;
  // The hub header is position:sticky. Native hash / scrollIntoView also
  // move the window, which slides main under the header. Pin the window
  // then scroll only the app scroller.
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  requestAnimationFrame(() => {
    if (scroller) {
      const top =
        target.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      scroller.scrollTo({ top, behavior: "smooth" });
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function onTocClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  e.preventDefault();
  scrollReportTo(id);
}

export function TocNav({
  data,
  topOffset = 53,
  variant = "document",
}: {
  data: Report;
  topOffset?: number;
  variant?: "document" | "chrome";
}) {
  const ids = data.sections
    .filter(id => id !== 'cover' && id !== 'toc' && id !== 'appendix')
    .filter(id => hasBackingData(data, id));

  const style = variant === "chrome"
    ? undefined
    : topOffset !== 53
      ? { top: topOffset }
      : undefined;

  return (
    <nav className={variant === "chrome" ? "toc toc--chrome" : "toc"} style={style}>
      <div className="container">
        <div className="toc-inner">
          <a href="#cover" className="brand" onClick={(e) => onTocClick(e, "cover")}>MONTHLY REPORT</a>
          {ids.map((id, i) => {
            const num = String(i + 1).padStart(2, '0');
            return (
              <a key={id} href={`#${id}`} onClick={(e) => onTocClick(e, id)}>{num} {LABELS[id]}</a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
