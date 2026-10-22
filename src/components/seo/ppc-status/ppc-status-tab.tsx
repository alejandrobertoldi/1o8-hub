"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { DateWindow, SectionB, WindowDays } from "@/lib/seo/ppc-status";
import { fmtMoney } from "./format";
import { AsinBlockCard, type AsinBlock } from "./asin-block-card";

// ── Types ─────────────────────────────────────────────────────────────

interface PpcStatusResponse {
  accountId: number | null;
  windowDays: WindowDays;
  cachedAt: string;
  gapWindow: DateWindow;
  blocks: AsinBlock[];
  notTracked: string[];
  sectionB: SectionB | null;
}

const WINDOW_OPTIONS: WindowDays[] = [30, 60, 90];

// ── Helpers ───────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtRoas(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}

function fmtCachedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `Data as of ${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

// ── Component ─────────────────────────────────────────────────────────

export function PpcStatusTab({ clientId }: { clientId: string }) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [asin, setAsin] = useState("all");
  const [asinOptions, setAsinOptions] = useState<string[]>([]);
  const [data, setData] = useState<PpcStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/seo/clients/${clientId}/ppc-status?window=${windowDays}${asin === "all" ? "" : `&asin=${encodeURIComponent(asin)}`}`,
          { signal },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load PPC status" }));
          setError(err.error || "Failed to load PPC status");
          return;
        }
        const json: PpcStatusResponse = await res.json();
        setData(json);
        // Keep the dropdown stable across filtering: only refresh the ASIN
        // list from an unfiltered response, so picking one ASIN doesn't
        // collapse the list down to just itself.
        if (asin === "all") setAsinOptions(json.blocks.map((b) => b.asin));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Failed to load PPC status");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [clientId, windowDays, asin],
  );

  useEffect(() => {
    // I1: the App Router does not remount this component on a dynamic-segment
    // change alone (same route template, same tree position) — see the
    // sibling [clientId]-keyed reset in seo-client-view.tsx:314. Without this,
    // switching clients while a stale ASIN filter is set would fetch that
    // ASIN against the new client and both fetch the wrong slice of data and
    // strand the dropdown on the old client's options.
    setAsin("all");
    setAsinOptions([]);
  }, [clientId]);

  useEffect(() => {
    // M3: switching the ASIN/window filter quickly can let an older response
    // overwrite a newer one; abort the previous in-flight fetch on cleanup.
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={asin} onValueChange={setAsin}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All ASINs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ASINs</SelectItem>
            {asinOptions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex rounded-full border border-stone-300 p-0.5 dark:border-zinc-700">
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              className={`h-8 rounded-full px-3 text-[13px] font-medium leading-none transition-colors ${
                windowDays === w
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-stone-50 dark:hover:bg-zinc-800"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>

        {data && <span className="text-xs text-muted-foreground">{fmtCachedAt(data.cachedAt)}</span>}
      </div>

      {loading ? (
        <PpcStatusSkeleton />
      ) : error ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" onClick={() => load()}>
            Retry
          </Button>
        </div>
      ) : data && data.accountId === null ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No PPC account linked for this client
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {data.blocks.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No live SEO versions for this client yet — mark a project live from its status pill.
              </CardContent>
            </Card>
          ) : (
            data.blocks.map((b) => <AsinBlockCard key={b.asin} block={b} windowDays={windowDays} />)
          )}
          <p className="text-[11px] text-muted-foreground">
            PPC numbers per ASIN come from the ad groups that advertise it today (current ad-group membership, not history).
          </p>
          {data.notTracked.length > 0 && (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm">Not tracked — no live version</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  Mark a project live from its status pill (go live…) to track these ASINs.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {data.notTracked.map((a) => (
                  <span key={a} className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-600 dark:bg-zinc-800 dark:text-zinc-300">{a}</span>
                ))}
              </CardContent>
            </Card>
          )}
          <SectionBCard sectionB={data.sectionB} />
        </>
      ) : null}
    </div>
  );
}

// ── Section B ─────────────────────────────────────────────────────────

function SectionBCard({ sectionB }: { sectionB: SectionB | null }) {
  if (!sectionB) return null;
  // M2: showing a column that is always "—" reads as broken; hide it when
  // no row in the current gap window has a suggested bid.
  const showBid = sectionB.noTraffic.some((k) => k.suggestedBid != null);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Gaps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            In listing, no PPC traffic ({sectionB.noTraffic.length})
          </p>
          {sectionB.noTraffic.length === 0 ? (
            <p className="text-xs text-muted-foreground">None.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Search volume</TableHead>
                    {showBid && <TableHead className="text-right">Suggested bid</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectionB.noTraffic.map((k) => (
                    <TableRow key={k.keyword}>
                      <TableCell className="max-w-[220px] truncate" title={k.keyword}>
                        {k.keyword}
                      </TableCell>
                      <TableCell>{k.tier ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {k.searchVolume != null ? fmtNum(k.searchVolume) : "—"}
                      </TableCell>
                      {showBid && (
                        <TableCell className="text-right tabular-nums">
                          {k.suggestedBid != null ? fmtMoney(k.suggestedBid) : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Converting in PPC, not in listing ({sectionB.missing.length})
          </p>
          {sectionB.missing.length === 0 ? (
            <p className="text-xs text-muted-foreground">None.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Search term</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectionB.missing.map((m) => (
                    <TableRow key={m.searchTerm}>
                      <TableCell className="max-w-[220px] truncate" title={m.searchTerm}>
                        {m.searchTerm}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(m.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(m.sales)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(m.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtRoas(m.roas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">In both: {sectionB.bothCount} keywords</p>
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────

function PpcStatusSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
