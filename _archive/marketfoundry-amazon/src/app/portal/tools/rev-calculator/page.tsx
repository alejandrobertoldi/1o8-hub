"use client";

import { RevCalculator } from "@/components/tools/rev-calculator";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

export default function PortalRevCalculatorPage() {
  return (
    <>
      <PageMetaSlot>
        <div className="flex flex-col min-w-0">
          <h1
            className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
            aria-label="Rev Calculator"
          >
            <span className="font-bold text-sidebar-foreground">Rev</span>
            <span className="font-normal text-portal-accent">Calculator</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Estimate revenue, margins, and profitability.</p>
        </div>
      </PageMetaSlot>
      <RevCalculator variant="portal" />
    </>
  );
}
