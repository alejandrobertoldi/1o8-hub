"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AsinBlockRow, DateWindow, Metrics, PerDay, WindowDays } from "@/lib/seo/ppc-status";
import { blockWindowLabel, fmtAvg, fmtDelta, fmtMoney } from "./format";

export interface AsinBlock {
  asin: string;
  title: string;
  projectId: string;
  projectName: string;
  version: number;
  liveDate: string;
  status: "live" | "future";
  /** False when no Sponsored Products ad group advertises this ASIN (O3). */
  advertised: boolean;
  windows: { before: DateWindow | null; after: DateWindow | null };
  sharedWith: number;
  rows: AsinBlockRow[];
  totals: { before: PerDay | null; after: PerDay | null; beforeTotals: Metrics; afterTotals: Metrics } | null;
}

const FIELD_LABEL: Record<string, string> = { T: "Title", B: "Bullets", D: "Description", K: "Backend" };

function roas(m: Metrics): string {
  return m.roas == null ? "—" : `${m.roas.toFixed(2)}x`;
}

const METRICS = ["Impr", "Clicks", "Spend", "Orders", "Sales"];

// O2: one cell per metric — "before → after" with the change beneath — keeps the table at 9
// columns so Sales and ROAS stay on screen. O1: impressions use fmtAvg like clicks, because
// per-day values below 1 rounded to "0" and showed "0 → 0 · new".
function MetricCells({ before, after }: { before: PerDay | null; after: PerDay | null }) {
  const cell = (fmt: (n: number) => string, k: keyof PerDay) => (
    <TableCell className="text-right tabular-nums">
      <div className="whitespace-nowrap">{before ? fmt(before[k]) : "—"} → {after ? fmt(after[k]) : "—"}</div>
      <div className="text-[10px] text-muted-foreground">{fmtDelta(before?.[k] ?? null, after?.[k] ?? null)}</div>
    </TableCell>
  );
  return (
    <>
      {cell(fmtAvg, "impressions")}
      {cell(fmtAvg, "clicks")}
      {cell(fmtMoney, "spend")}
      {cell(fmtAvg, "orders")}
      {cell(fmtMoney, "sales")}
    </>
  );
}

export function AsinBlockCard({ block, windowDays }: { block: AsinBlock; windowDays: WindowDays }) {
  const tag = `V${String(block.version).padStart(2, "0")}`;
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="font-mono">{block.asin}</span>
          <span className="truncate font-normal text-muted-foreground" title={block.title}>{block.title}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {block.projectName} · {tag} · live {block.liveDate} · {blockWindowLabel(block.windows, windowDays, block.liveDate, block.status)}
          {block.sharedWith > 0 && ` · ad group also advertises ${block.sharedWith} other ASIN${block.sharedWith === 1 ? "" : "s"}`}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {block.status === "future" ? null : !block.advertised ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Not advertised in Sponsored Products — no PPC data for this ASIN.
            {block.rows.length > 0 && <> Tracked keywords: {block.rows.map((r) => r.keyword).join(", ")}.</>}
          </p>
        ) : block.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tracked keywords found in {tag}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Tier</TableHead>
                {METRICS.map((m) => (
                  <TableHead key={m} className="text-right">{m} / day</TableHead>
                ))}
                <TableHead className="text-right">ROAS before → after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((r) => (
                <TableRow key={r.keyword}>
                  <TableCell>{r.keyword}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.fields.map((f) => (
                        <span key={f} title={FIELD_LABEL[f]} className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-600 dark:bg-zinc-800 dark:text-zinc-300">{f}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{r.tier ?? "—"}</TableCell>
                  <MetricCells before={r.before} after={r.after} />
                  <TableCell className="text-right tabular-nums">{roas(r.beforeTotals)} → {roas(r.afterTotals)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {block.totals && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell />
                  <TableCell />
                  <MetricCells before={block.totals.before} after={block.totals.after} />
                  <TableCell className="text-right tabular-nums">{roas(block.totals.beforeTotals)} → {roas(block.totals.afterTotals)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
