/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GitBranch,
  Loader2,
  RefreshCw,
  XCircle,
  Cloud,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMetaSlot } from "@/components/layout/page-header-slot";

// ── Types ─────────────────────────────────────────────────────────────

interface GitBranchData {
  name: string;
  shortHash: string;
  date: string;
  author: string;
  subject: string;
  isMain: boolean;
  isCurrent: boolean;
  hasRemote: boolean;
  aheadBehind: { ahead: number; behind: number } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US");
}

// ── Branch colors ─────────────────────────────────────────────────────

const BRANCH_COLORS = [
  "#4A90D9", // blue (main)
  "#F7BF1D", // brand gold
  "#8B5CF6", // violet
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#06B6D4", // cyan
  "#EC4899", // pink
];

// ── Branch Diagram (SVG) ──────────────────────────────────────────────

function BranchDiagram({ branches }: { branches: GitBranchData[] }) {
  const layout = useMemo(() => {
    if (!branches.length) return null;

    const mainBranch = branches.find((b) => b.isMain);
    const featureBranches = branches.filter((b) => !b.isMain);

    // Layout constants — smaller dots, more spacing for info
    const nodeR = 7;
    const rowH = 68;
    const colW = 180;
    const padTop = 44;
    const padLeft = 240; // room for left-side labels
    const mainX = padLeft + colW;

    type Row = {
      branch: GitBranchData;
      x: number;
      y: number;
      color: string;
      forkFromY: number;
      side: "left" | "right" | "center";
    };

    const rows: Row[] = [];

    // Main at top
    if (mainBranch) {
      rows.push({
        branch: mainBranch,
        x: mainX,
        y: padTop,
        color: BRANCH_COLORS[0],
        forkFromY: padTop,
        side: "center",
      });
    }

    // Alternate left/right
    const left: GitBranchData[] = [];
    const right: GitBranchData[] = [];
    featureBranches.forEach((b, i) => (i % 2 === 0 ? left : right).push(b));

    const maxSide = Math.max(left.length, right.length);
    let y = padTop + rowH;

    for (let i = 0; i < maxSide; i++) {
      if (left[i]) {
        rows.push({
          branch: left[i],
          x: mainX - colW,
          y,
          color: BRANCH_COLORS[((i * 2) % (BRANCH_COLORS.length - 1)) + 1],
          forkFromY: y,
          side: "left",
        });
      }
      if (right[i]) {
        rows.push({
          branch: right[i],
          x: mainX + colW,
          y,
          color: BRANCH_COLORS[((i * 2 + 1) % (BRANCH_COLORS.length - 1)) + 1],
          forkFromY: y,
          side: "right",
        });
      }
      y += rowH;
    }

    const bottomY = y;
    const svgW = mainX + colW + padLeft + 200;
    const svgH = bottomY + 30;

    return { rows, mainX, padTop, bottomY, svgW, svgH, nodeR };
  }, [branches]);

  if (!layout) return null;

  return (
    <div className="overflow-x-auto">
      <svg
        width={layout.svgW}
        height={layout.svgH}
        viewBox={`0 0 ${layout.svgW} ${layout.svgH}`}
        className="mx-auto"
      >
        {/* Main trunk */}
        <line
          x1={layout.mainX}
          y1={layout.padTop - 16}
          x2={layout.mainX}
          y2={layout.bottomY}
          stroke="var(--muted-foreground)"
          strokeWidth={2}
          opacity={0.15}
        />

        {layout.rows.map((row) => {
          const isMain = row.branch.isMain;
          const isCurrent = row.branch.isCurrent;
          const ab = row.branch.aheadBehind;
          const R = layout.nodeR;

          // Text anchor positions
          const labelX =
            row.side === "center"
              ? row.x
              : row.side === "left"
                ? row.x - R - 10
                : row.x + R + 10;
          const anchor =
            row.side === "center"
              ? "middle"
              : row.side === "left"
                ? "end"
                : "start";

          return (
            <g key={row.branch.name}>
              {/* Fork curve */}
              {!isMain && (
                <path
                  d={`M ${layout.mainX} ${row.forkFromY} C ${layout.mainX} ${row.forkFromY + 22}, ${row.x} ${row.y - 22}, ${row.x} ${row.y}`}
                  fill="none"
                  stroke={row.color}
                  strokeWidth={2}
                  opacity={0.6}
                />
              )}

              {/* Stub lines */}
              {!isMain && (
                <line
                  x1={row.x}
                  y1={row.y - 12}
                  x2={row.x}
                  y2={row.y + 12}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  opacity={0.1}
                />
              )}

              {/* Node */}
              <circle
                cx={row.x}
                cy={row.y}
                r={R}
                fill={row.color}
                stroke={isCurrent ? "var(--foreground)" : row.color}
                strokeWidth={isCurrent ? 2.5 : 1.5}
                opacity={0.9}
              />

              {/* Current indicator ring */}
              {isCurrent && (
                <circle
                  cx={row.x}
                  cy={row.y}
                  r={R + 4}
                  fill="none"
                  stroke={row.color}
                  strokeWidth={1}
                  opacity={0.35}
                  strokeDasharray="3 2"
                />
              )}

              {/* Branch name */}
              <text
                x={labelX}
                y={row.y - 14}
                textAnchor={anchor}
                className="text-[11px] font-bold fill-foreground"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                {row.branch.name.replace("marketfoundry-agency/", "")}
              </text>

              {/* Commit subject (truncated) */}
              <text
                x={labelX}
                y={row.y + 2}
                textAnchor={anchor}
                className="text-[9px] fill-foreground"
                opacity={0.7}
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                {row.branch.subject.length > 40
                  ? row.branch.subject.slice(0, 40) + "…"
                  : row.branch.subject}
              </text>

              {/* Hash · author · time */}
              <text
                x={labelX}
                y={row.y + 14}
                textAnchor={anchor}
                className="text-[9px] fill-foreground"
                opacity={0.5}
                style={{ fontFamily: "var(--font-geist-mono, monospace)" }}
              >
                {row.branch.shortHash} · {row.branch.author} · {relativeTime(row.branch.date)}
              </text>

              {/* Ahead/behind badges */}
              {ab && (ab.ahead > 0 || ab.behind > 0) && (
                <g
                  transform={`translate(${
                    row.side === "left"
                      ? row.x - R - 10
                      : row.side === "right"
                        ? row.x + R + 10
                        : row.x + R + 8
                  }, ${row.y + 24})`}
                >
                  {ab.ahead > 0 && (
                    <>
                      <rect
                        x={row.side === "left" ? -38 : 0}
                        y={-7}
                        width={34}
                        height={14}
                        rx={4}
                        fill="#10B981"
                        opacity={0.15}
                      />
                      <text
                        x={row.side === "left" ? -21 : 17}
                        y={4}
                        textAnchor="middle"
                        className="text-[8px] font-bold"
                        fill="#10B981"
                      >
                        +{ab.ahead}
                      </text>
                    </>
                  )}
                  {ab.behind > 0 && (
                    <>
                      <rect
                        x={row.side === "left" ? -76 : ab.ahead > 0 ? 38 : 0}
                        y={-7}
                        width={34}
                        height={14}
                        rx={4}
                        fill="#EF4444"
                        opacity={0.15}
                      />
                      <text
                        x={
                          row.side === "left"
                            ? -59
                            : ab.ahead > 0
                              ? 55
                              : 17
                        }
                        y={4}
                        textAnchor="middle"
                        className="text-[8px] font-bold"
                        fill="#EF4444"
                      >
                        -{ab.behind}
                      </text>
                    </>
                  )}
                </g>
              )}

              {/* Remote dot */}
              {row.branch.hasRemote && (
                <circle
                  cx={row.x + R - 1}
                  cy={row.y - R + 1}
                  r={2.5}
                  fill="#10B981"
                  stroke="var(--card)"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(12, ${layout.bottomY - 6})`}>
          <circle cx={5} cy={0} r={3} fill={BRANCH_COLORS[0]} opacity={0.7} />
          <text x={13} y={3} className="text-[9px] fill-foreground" opacity={0.5}>
            main
          </text>
          <circle
            cx={46}
            cy={0}
            r={3}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={1}
            strokeDasharray="2 1.5"
            opacity={0.35}
          />
          <text x={54} y={3} className="text-[9px] fill-foreground" opacity={0.5}>
            current
          </text>
          <circle cx={96} cy={0} r={2} fill="#10B981" opacity={0.7} />
          <text x={103} y={3} className="text-[9px] fill-foreground" opacity={0.5}>
            remote
          </text>
        </g>
      </svg>
    </div>
  );
}

// ── Branch Table (summary view) ───────────────────────────────────────

function BranchTable({ branches }: { branches: GitBranchData[] }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/20 bg-muted/20">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Branch</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Commit</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Author</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Age</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Remote</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr
              key={b.name}
              className={`border-b border-border/10 hover:bg-muted/10 ${
                b.isCurrent ? "bg-brand/5" : ""
              }`}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: b.isMain
                        ? BRANCH_COLORS[0]
                        : BRANCH_COLORS[
                            (Math.abs(
                              b.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
                            ) %
                              (BRANCH_COLORS.length - 1)) +
                              1
                          ],
                    }}
                  />
                  <span className="font-mono text-xs text-foreground">
                    {b.name.replace("marketfoundry-agency/", "")}
                  </span>
                  {b.isCurrent && (
                    <span className="text-[8px] font-bold uppercase tracking-wider text-brand px-1.5 py-0.5 rounded bg-brand/10">
                      HEAD
                    </span>
                  )}
                  {b.isMain && (
                    <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-500 px-1.5 py-0.5 rounded bg-emerald-500/10">
                      default
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="text-xs text-foreground/80 max-w-[300px] truncate">
                  {b.subject}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">{b.shortHash}</div>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{b.author}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                {relativeTime(b.date)}
              </td>
              <td className="px-3 py-2 text-center">
                {b.hasRemote ? (
                  <Cloud className="size-3.5 text-emerald-500 mx-auto" />
                ) : (
                  <span className="text-[10px] text-muted-foreground/40">local</span>
                )}
              </td>
              <td className="px-3 py-2">
                {b.aheadBehind ? (
                  <div className="flex items-center justify-center gap-2 text-[10px] tabular-nums">
                    {b.aheadBehind.ahead > 0 && (
                      <span className="flex items-center gap-0.5 text-emerald-500">
                        <ArrowUp className="size-3" />
                        {b.aheadBehind.ahead}
                      </span>
                    )}
                    {b.aheadBehind.behind > 0 && (
                      <span className="flex items-center gap-0.5 text-red-400">
                        <ArrowDown className="size-3" />
                        {b.aheadBehind.behind}
                      </span>
                    )}
                    {b.aheadBehind.ahead === 0 && b.aheadBehind.behind === 0 && (
                      <CheckCircle2 className="size-3.5 text-emerald-400 mx-auto" />
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/40 block text-center">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function RepoPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<{
    branches: GitBranchData[];
    currentBranch: string;
  }>({
    queryKey: ["git-branches"],
    queryFn: async () => {
      const res = await fetch("/api/admin/git-branches");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const branches = data?.branches ?? [];
  const mainBranch = branches.find((b) => b.isMain);
  const featureBranches = branches.filter((b) => !b.isMain);
  const withRemote = branches.filter((b) => b.hasRemote).length;
  const localOnly = branches.filter((b) => !b.hasRemote).length;

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1
          className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none"
          aria-label="Repo Sync"
        >
          <span className="font-bold text-sidebar-foreground">Repo</span>
          <span className="font-normal text-brand">Sync</span>
        </h1>
      </PageMetaSlot>
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-6 lg:-mx-10 px-6 lg:px-10 py-4 mb-2 bg-background flex flex-col sm:flex-row sm:items-start sm:justify-end gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="border-border/60 hover:border-brand/30 hover:shadow-[0_0_12px_-4px_var(--brand-glow)] mt-2 sm:mt-0"
        >
          {isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-1.5">Refresh</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="size-8 animate-spin text-brand" />
          <p className="text-sm text-muted-foreground">Loading repository data…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-5 py-4 text-sm text-red-500 dark:text-red-400 flex items-center gap-3">
          <XCircle className="size-5 shrink-0" />
          Failed to load repository data
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/60 bg-card px-4 py-3.5 space-y-1.5 card-glow">
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Total Branches
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{branches.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card px-4 py-3.5 space-y-1.5 card-glow">
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-brand" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Current
                </span>
              </div>
              <p className="text-lg font-bold text-brand font-mono truncate">
                {data?.currentBranch?.replace("marketfoundry-agency/", "") ?? "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card px-4 py-3.5 space-y-1.5 card-glow">
              <div className="flex items-center gap-2">
                <Cloud className="size-4 text-emerald-500" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Remote
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {withRemote}
                <span className="text-sm text-muted-foreground font-normal ml-1">
                  / {localOnly} local
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card px-4 py-3.5 space-y-1.5 card-glow">
              <div className="flex items-center gap-2">
                <GitBranch className="size-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Feature
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {featureBranches.length}
              </p>
            </div>
          </div>

          {/* Branch Diagram */}
          <div className="rounded-xl border border-border/60 bg-card/50 p-5 card-glow">
            <div className="flex items-center gap-2.5 mb-4">
              <GitBranch className="size-4 text-brand" />
              <h2 className="text-sm font-[family-name:var(--font-outfit)] text-foreground">
                Branch Graph
              </h2>
            </div>
            <BranchDiagram branches={branches} />
          </div>

          {/* Branch Table */}
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <GitBranch className="size-4 text-brand" />
              All Branches
            </h2>
            <BranchTable branches={branches} />
          </div>
        </>
      )}
    </div>
  );
}
