"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/components/reviews/reviews-dashboard";
import { formatPeriod } from "@/components/case-study/kit/primitives";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/case-study/kit/stages";
import type { DeckFormat } from "@/lib/case-study/kit/display";
import type { TrackerCell, TrackerRow } from "@/lib/case-study/kit/types";

const FORMAT_COLUMNS: { key: keyof Pick<TrackerRow, "highLevel" | "detailed">; format: DeckFormat; label: string }[] = [
  { key: "highLevel", format: "high_level", label: "High-Level" },
  { key: "detailed", format: "detailed", label: "Detailed" },
];

// Summary order: sent · approved · in review · drafting · not started.
const SUMMARY_ORDER: (Stage | "not_started")[] = ["sent", "approved", "in_review", "drafting", "not_started"];

const STAGE_CHIP_CLASS: Record<Stage | "not_started", string> = {
  not_started: "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800",
  drafting: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  in_review: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
};

function stageOf(cell: TrackerCell | null): Stage | "not_started" {
  return cell ? cell.stage : "not_started";
}

function TrackerCellView({ clientIdCode, format, cell }: { clientIdCode: string; format: DeckFormat; cell: TrackerCell | null }) {
  const stage = stageOf(cell);
  const href = `/clients/${clientIdCode}/case-study?format=${format}`;
  return (
    <Link href={href} className="flex flex-col gap-1 rounded-md p-1.5 hover:bg-muted/60 transition-colors">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-md border px-2 py-0.5 text-[9px] font-bold", STAGE_CHIP_CLASS[stage])}>
          {cell ? STAGE_LABELS[stage] : "Create"}
        </span>
        {cell && cell.blockers > 0 && (
          <span className="rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {`!${cell.blockers}`}
          </span>
        )}
        {cell && cell.manualImages > 0 && (
          <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400">
            {`${cell.manualImages} manual`}
          </span>
        )}
      </div>
      {cell && (
        <div className="text-[10px] text-muted-foreground">
          <div>{cell.ownerName ?? "Unassigned"}</div>
          <div>{formatPeriod(cell.dateRangeStart, cell.dateRangeEnd)}</div>
          <div>{`Updated ${relativeTime(cell.updatedAt)}`}</div>
        </div>
      )}
    </Link>
  );
}

function summaryLine(rows: TrackerRow[], key: "highLevel" | "detailed", label: string): string {
  const counts: Record<Stage | "not_started", number> = { not_started: 0, drafting: 0, in_review: 0, approved: 0, sent: 0 };
  for (const row of rows) counts[stageOf(row[key])]++;
  const parts = SUMMARY_ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${STAGE_LABELS[s].toLowerCase()}`);
  return `${label} — ${parts.join(" · ")}`;
}

export function TrackerTable({ rows }: { rows: TrackerRow[] }) {
  const [stage, setStage] = useState<"all" | Stage | "not_started">("all");
  const [format, setFormat] = useState<"all" | DeckFormat>("all");
  const [owner, setOwner] = useState<"all" | string>("all");
  const [hasBlockers, setHasBlockers] = useState(false);

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.highLevel?.ownerName) set.add(row.highLevel.ownerName);
      if (row.detailed?.ownerName) set.add(row.detailed.ownerName);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const cells: { cell: TrackerCell | null; format: DeckFormat }[] = [
        { cell: row.highLevel, format: "high_level" },
        { cell: row.detailed, format: "detailed" },
      ];
      const relevant = format === "all" ? cells : cells.filter((c) => c.format === format);
      return relevant.some(({ cell }) => {
        if (stage !== "all" && stageOf(cell) !== stage) return false;
        if (owner !== "all" && cell?.ownerName !== owner) return false;
        if (hasBlockers && !(cell && cell.blockers > 0)) return false;
        return true;
      });
    });
  }, [rows, stage, format, owner, hasBlockers]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value as typeof stage)} className="rounded-md border border-stone-300 bg-card px-2 py-1.5 text-xs dark:border-zinc-700">
          <option value="all">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          <option value="not_started">{STAGE_LABELS.not_started}</option>
        </select>
        <select aria-label="Format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className="rounded-md border border-stone-300 bg-card px-2 py-1.5 text-xs dark:border-zinc-700">
          <option value="all">All formats</option>
          <option value="high_level">High-Level</option>
          <option value="detailed">Detailed</option>
        </select>
        <select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-md border border-stone-300 bg-card px-2 py-1.5 text-xs dark:border-zinc-700">
          <option value="all">All owners</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={hasBlockers} onChange={(e) => setHasBlockers(e.target.checked)} className="accent-brand" />
          Has blockers
        </label>
      </div>

      <div className="space-y-0.5 text-xs text-muted-foreground">
        {FORMAT_COLUMNS.map(({ key, label }) => <div key={key}>{summaryLine(rows, key, label)}</div>)}
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-stone-200 bg-card dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-zinc-800">
              <th className="p-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</th>
              {FORMAT_COLUMNS.map(({ key, label }) => (
                <th key={key} className="p-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.clientIdCode} className="border-b border-stone-100 last:border-0 dark:border-zinc-800/60">
                <td className="p-2.5 align-top font-medium">{row.clientName}</td>
                {FORMAT_COLUMNS.map(({ key, format: f }) => (
                  <td key={key} className="p-2.5 align-top">
                    <TrackerCellView clientIdCode={row.clientIdCode} format={f} cell={row[key]} />
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="p-6 text-center text-xs text-muted-foreground">No clients match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
