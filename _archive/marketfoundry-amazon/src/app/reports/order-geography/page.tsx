"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { OrderGeographySection } from "@/components/reports/v2/order-geography-section";
import { TrailingRangePicker, useTrailingRange } from "@/components/reports/v2/trailing-range-picker";
import { GeographyViewSwitch } from "@/components/reports/v2/geography-view-switch";
import { FbaInventoryMapSection } from "@/components/reports/fba-inventory-map/fba-inventory-map-section";
import { StockMonthSelect } from "@/components/reports/fba-inventory-map/stock-month-select";
import { useGeographyStockMonth } from "@/components/reports/v2/use-geography-stock-month";
import { parseRangeParams } from "@/lib/reports/range-params";
import { buildGeographyQuery, parseGeographyView, type GeographyView } from "@/lib/reports/geography-view";
import { isMonth } from "@/lib/fba-inventory-map/month";

// Geography: Order Geography and the FBA Inventory Map on one page. Orders use a
// trailing lookback (page-local, surfaced through `extras` like before); stock
// uses its own monthly snapshot picker. The two periods are deliberately
// independent (Thread Z2 ruling) — the Both caption names each of them.
function GeographyReportContent() {
  const controls = useReportControls();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const range = useTrailingRange(parseRangeParams(searchParams.get("start"), searchParams.get("end")) ?? undefined);
  const { accountId, refreshKey } = controls;

  const [view, setView] = useState<GeographyView>(() => parseGeographyView(searchParams.get("view")));
  const { month, stockMonths, onStockMonths, pickMonth } = useGeographyStockMonth(accountId, (() => {
    const m = searchParams.get("month");
    return m && isMonth(m) ? m : null;
  })());

  const custom = range.preset === "custom";
  useEffect(() => {
    const next = buildGeographyQuery(searchParams.toString(), {
      view,
      start: custom ? range.start : null,
      end: custom ? range.end : null,
      month,
    });
    if (next !== searchParams.toString()) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [view, custom, range.start, range.end, month, searchParams, router, pathname]);

  const showRange = view !== "inventory";
  const showStock = view !== "orders";

  return (
    <div>
      <PageMetaSlot>
        <ReportsControlsBar
          surface="hub"
          controls={controls}
          sectionLabel="Geography"
          refreshSection="order-geography"
          showDates={false}
          showRefreshButton={view !== "inventory"}
          refreshRange={{ start: range.start, end: range.end }}
        />
      </PageMetaSlot>
      <div className="min-h-screen" style={{ background: "var(--mf-ghost)" }}>
        <main className="mf-paper mx-auto w-[min(calc(100%-32px),1760px)] pb-14 pt-3">
          <div className="mb-5 text-mf-ink">
            <h1 className="m-0 text-[clamp(26px,3vw,42px)] font-extrabold leading-none tracking-[-0.045em]">
              <span className="text-brand">Geography</span>
            </h1>
            <p className="mt-2.5 max-w-[760px] text-mf-muted">
              Where orders land and where Amazon holds this account&rsquo;s FBA stock, by state. Switch between orders,
              inventory, or both on one map; click a state for its breakdown.
            </p>
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <GeographyViewSwitch value={view} onChange={setView} />
            {showRange && <TrailingRangePicker surface="hub" range={range} />}
            {showStock && stockMonths && stockMonths.months.length > 0 && stockMonths.month && (
              <StockMonthSelect value={month ?? stockMonths.month} months={stockMonths.months} onChange={pickMonth} />
            )}
          </div>
          {view === "inventory" ? (
            <FbaInventoryMapSection accountId={accountId} refreshKey={refreshKey} month={month} onMonths={onStockMonths} />
          ) : (
            <OrderGeographySection
              surface="hub"
              accountId={accountId}
              start={range.start}
              end={range.end}
              refreshKey={refreshKey}
              stockMonth={view === "both" ? month : undefined}
              onStockMonths={view === "both" ? onStockMonths : undefined}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function GeographyReportPage() {
  return (
    <Suspense fallback={null}>
      <GeographyReportContent />
    </Suspense>
  );
}
