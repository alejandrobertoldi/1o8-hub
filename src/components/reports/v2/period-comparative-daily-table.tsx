"use client";

import { Surface } from "./primitives/surface";

export interface PeriodDailyRow {
  report_date: string;
  ad_revenue: number;
  ad_revenue_pm: number;
  ad_revenue_py: number;
  ad_spend: number;
  ad_spend_pm: number;
  ad_spend_py: number;
  organic_sales: number;
  organic_sales_pm: number;
  organic_sales_py: number;
  product_sales: number;
  product_sales_pm: number;
  product_sales_py: number;
  acos: number;
  acos_pm: number;
  acos_py: number;
  roas: number;
  roas_pm: number;
  roas_py: number;
  tacos: number;
  tacos_pm: number;
  tacos_py: number;
}

type FmtType = "currency" | "pct" | "ratio";

function fmtCurrency(n: number) {
  if (n === 0) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number) {
  return n === 0 ? "" : `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtRatio(n: number) {
  return n === 0 ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function applyFmt(n: number, fmt: FmtType) {
  if (fmt === "currency") return fmtCurrency(n);
  if (fmt === "pct") return fmtPct(n);
  return fmtRatio(n);
}

function fmtDate(s: string) {
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface MetricGroup {
  base: "ad_revenue" | "ad_spend" | "organic_sales" | "product_sales" | "acos" | "roas" | "tacos";
  label: string;
  fmt: FmtType;
}

const GROUPS: MetricGroup[] = [
  { base: "ad_revenue", label: "Ad Revenue", fmt: "currency" },
  { base: "ad_spend", label: "Ad Spend", fmt: "currency" },
  { base: "organic_sales", label: "Organic Sales", fmt: "currency" },
  { base: "product_sales", label: "Product Sales", fmt: "currency" },
  { base: "acos", label: "ACoS", fmt: "pct" },
  { base: "roas", label: "RoAS", fmt: "ratio" },
  { base: "tacos", label: "TACoS", fmt: "pct" },
];

const SUFFIXES: { suffix: "" | "_pm" | "_py"; label: string }[] = [
  { suffix: "", label: "Current" },
  { suffix: "_pm", label: "Prev mo" },
  { suffix: "_py", label: "Prev yr" },
];

const COLUMNS: { key: keyof PeriodDailyRow; fmt: FmtType; groupEnd: boolean }[] = GROUPS.flatMap((g) =>
  SUFFIXES.map((s, i) => ({
    key: `${g.base}${s.suffix}` as keyof PeriodDailyRow,
    fmt: g.fmt,
    groupEnd: i === SUFFIXES.length - 1,
  }))
);

export function PeriodComparativeDailyTable({ daily }: { daily: PeriodDailyRow[] }) {
  const rows = daily.toSorted(
    (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime()
  );

  const totals = COLUMNS.reduce((acc, col) => {
    if (col.fmt === "pct" || col.fmt === "ratio") {
      acc[col.key] = 0;
    } else {
      acc[col.key] = rows.reduce((sum, r) => sum + ((r[col.key] as number) ?? 0), 0);
    }
    return acc;
  }, {} as Record<string, number>);

  // ACoS / RoAS / TACoS totals are ratios of sums, not sums of ratios.
  for (const { suffix } of SUFFIXES) {
    const spend = totals[`ad_spend${suffix}`] ?? 0;
    const rev = totals[`ad_revenue${suffix}`] ?? 0;
    const sales = totals[`product_sales${suffix}`] ?? 0;
    totals[`acos${suffix}`] = rev !== 0 ? (spend / rev) * 100 : 0;
    totals[`roas${suffix}`] = spend !== 0 ? rev / spend : 0;
    totals[`tacos${suffix}`] = sales !== 0 ? (spend / sales) * 100 : 0;
  }

  return (
    <Surface title="Daily detail" subtitle={`${rows.length} days · current vs previous month & previous year`}>
      <div className="custom-scroll max-h-[500px] overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: "max-content", width: "100%" }}>
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 border-b border-r border-mf-line bg-mf-ghost px-4 text-center font-bold text-mf-ink"
                style={{ minWidth: "110px" }}
              >
                Date
              </th>
              {GROUPS.map((g) => (
                <th
                  key={g.base}
                  colSpan={3}
                  className="sticky top-0 z-20 h-8 border-r border-mf-line bg-mf-ghost px-4 text-center text-[11px] font-bold text-mf-ink"
                >
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className={`sticky top-8 z-20 border-b border-mf-line bg-mf-ghost px-4 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-mf-muted ${
                    col.groupEnd ? "border-r" : ""
                  }`}
                  style={{ minWidth: "104px" }}
                >
                  {SUFFIXES[i % 3].label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => (
              <tr key={row.report_date} className="border-b border-mf-line/60 transition-colors hover:bg-mf-ghost/60">
                <td
                  className="sticky left-0 z-10 border-r border-mf-line px-4 py-2 text-center font-semibold text-mf-ink"
                  style={{ backgroundColor: i % 2 === 0 ? "#FEFEFE" : "#F7F6FB" }}
                >
                  {fmtDate(row.report_date)}
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 text-right tabular-nums text-mf-ink ${col.groupEnd ? "border-r border-mf-line/60" : ""} ${
                      i % 2 === 0 ? "bg-white" : "bg-[#F7F6FB]"
                    }`}
                  >
                    {applyFmt((row[col.key] as number) ?? 0, col.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <td className="sticky bottom-0 left-0 z-30 border-r border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-center font-bold text-mf-ink">
                Total
              </td>
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className={`sticky bottom-0 z-20 border-t border-mf-line bg-mf-ghost px-4 py-2.5 text-right font-bold tabular-nums text-mf-ink ${
                    col.groupEnd ? "border-r" : ""
                  }`}
                >
                  {applyFmt(totals[col.key] ?? 0, col.fmt)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Surface>
  );
}
