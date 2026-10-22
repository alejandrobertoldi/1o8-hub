'use client';
/* eslint-disable react-doctor/nextjs-no-img-element */
import React from 'react';
import type { Report as ReportData, SectionId } from './types';
import { brand, resolveAccent } from './defaults';
import { TopBar } from './shell/TopBar';
import { TocNav } from './shell/TocNav';
import { CoverHeader } from './sections/CoverHeader';
import { KPISection } from './sections/KPISection';
import { CampaignManagerSection } from './sections/CampaignManagerSection';
import { MoMSection } from './sections/MoMSection';
import { FindingsSection } from './sections/FindingsSection';
import { ProductsSection } from './sections/ProductsSection';
import { DirectionsSection } from './sections/DirectionsSection';
import { ScorecardSection } from './sections/ScorecardSection';
import { SectionCommentBlock } from './sections/SectionComment';
import { COMMENTABLE_SECTION_IDS } from '@/lib/monthly-report/section-comments';

type SectionRenderer = (props: { data: ReportData }) => React.ReactNode;

const SECTIONS: Partial<Record<SectionId, SectionRenderer>> = {
  cover:      ({ data }) => <CoverHeader data={data} />,
  // 'toc' is rendered by TocNav at the top of Report; we omit it from the body map.
  kpis:       ({ data }) => <KPISection data={data} />,
  campaigns:  ({ data }) => <CampaignManagerSection data={data} />,
  mom:        ({ data }) => <MoMSection data={data} />,
  highlights: ({ data }) => <FindingsSection data={data} />,
  products:   ({ data }) => <ProductsSection data={data} />,
  goals:      ({ data }) => <DirectionsSection data={data} />,
  risks:      ({ data }) => <ScorecardSection data={data} />,
};

const COMMENTABLE = new Set<SectionId>(COMMENTABLE_SECTION_IDS);

export function Report({
  data,
  printMode = false,
  showTopBar = true,
  showToc = true,
  commentsEditable = false,
  savingCommentId = null,
  onSaveComment,
}: {
  data: ReportData;
  printMode?: boolean;
  showTopBar?: boolean;
  /** When false, the caller renders TocNav in hub chrome instead. */
  showToc?: boolean;
  commentsEditable?: boolean;
  savingCommentId?: SectionId | null;
  onSaveComment?: (sectionId: SectionId, text: string) => void;
}) {
  const accent = resolveAccent(data.meta.accent);
  const order = data.sections.filter((id) => id !== "appendix");
  const renderToc = showToc && !printMode && order.includes('toc');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--orange', accent);
    const el = wrapperRef.current;
    if (!el) return;
    if (printMode) {
      el.classList.add('print-mode');
    } else {
      el.classList.remove('print-mode');
    }
    return () => {
      el.classList.remove('print-mode');
    };
  }, [accent, printMode]);

  return (
    <div ref={wrapperRef} className="report-doc">
      {printMode && (
        <img className="print-running-logo" src="/1o8_Logo_Ink.png" alt="1o8 Agency" />
      )}
      {!printMode && showTopBar && <TopBar data={data} />}
      {renderToc && <TocNav data={data} topOffset={showTopBar ? 53 : 0} />}
      {order.map((id, i) => {
        const node = SECTIONS[id]?.({ data });
        return (
          <React.Fragment key={id + i}>
            {node}
            {node && COMMENTABLE.has(id) && (
              <SectionCommentBlock
                sectionId={id}
                comment={data.sectionComments?.[id]}
                editable={commentsEditable && !printMode}
                saving={savingCommentId === id}
                onSave={onSaveComment}
              />
            )}
          </React.Fragment>
        );
      })}
      {!printMode && (
        <footer>
          <div className="cover-logo">
            <img src="/1o8_Logo_Ink.png" alt="1o8 Agency" />
          </div>
          <div className="container">
            <div className="sig">{brand.agency} · Monthly<em>Report</em></div>
            <div className="meta">
              {data.meta.client} · {data.meta.month} · Issued {data.meta.issued} · Confidential
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
