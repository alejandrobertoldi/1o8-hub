# Forecast Tool — Seasonality Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a skippable Seasonality Step between version creation and the forecast grid that computes monthly Category Coefficients from Helium 10 Cerebro keyword data and historical search volume CSVs.

**Architecture:** New `seasonality-step.tsx` component with 4 internal phases (copy ASINs → upload Cerebro CSV → upload search volume CSVs → review/apply). Page-level routing via a `showSeasonality` state flag in the forecast page. Data persisted as a JSONB column on `forecast_tool_versions` + individual `category_coef` cells written via existing cells API.

**Tech Stack:** React 19, Next.js 16 App Router, Drizzle ORM, PostgreSQL, TanStack Query, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-16-forecast-seasonality-design.md`

---

## File Map

| File                                                         | Action | Responsibility                         |
|--------------------------------------------------------------|--------|----------------------------------------|
| `src/lib/db/schema.ts`                                       | Modify | Add `seasonalityData` JSONB column     |
| `drizzle/migrations/0035_add_seasonality_data.sql`           | Create | Migration SQL                          |
| `src/app/api/ppc/forecast-tool/versions/[id]/route.ts`       | Modify | Accept `seasonalityData` in PUT        |
| `src/components/ppc/forecast-tool/seasonality-step.tsx`      | Create | Full seasonality wizard (phases 3a–3d) |
| `src/app/sales-summary/forecast-v2/page.tsx`                 | Modify | Step routing + "Edit Seasonality" flow |
| `src/components/ppc/forecast-tool/forecast-grid.tsx`         | Modify | Add `onEditSeasonality` prop + button  |

---

### Task 1: Schema — Add seasonalityData column

**Files:**
- Modify: `src/lib/db/schema.ts:1867-1886`
- Create: `drizzle/migrations/0035_add_seasonality_data.sql`

- [ ] **Step 1: Add column to Drizzle schema**

In `src/lib/db/schema.ts`, add `seasonalityData` to the `forecastToolVersions` table definition, after the `asinHistoricalData` line:

```typescript
    asinHistoricalData: jsonb("asin_historical_data").$type<Record<string, Record<string, Record<string, number>>>>(),
    seasonalityData: jsonb("seasonality_data").$type<{
      keywords: string[];
      coefficients: Record<string, number>;
      rawSearchVolume: Record<string, { date: string; volume: number }[]>;
    }>(),
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`

This creates a migration file in `drizzle/migrations/`. If the auto-generated name differs from `0035_add_seasonality_data.sql`, that's fine — use whatever Drizzle generates.

- [ ] **Step 3: Run migration**

Run: `npm run db:push`

Expected: column `seasonality_data` added to `forecast_tool_versions` table.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(forecast): add seasonality_data JSONB column to forecast_tool_versions"
```

---

### Task 2: API — Accept seasonalityData in version PUT

**Files:**
- Modify: `src/app/api/ppc/forecast-tool/versions/[id]/route.ts:41-44`

- [ ] **Step 1: Add seasonalityData to updateData in PUT handler**

In the PUT handler, find the block that builds `updateData` (around line 41-44):

```typescript
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isCurrent !== undefined) updateData.isCurrent = body.isCurrent;
  if (body.isLocked !== undefined) updateData.isLocked = body.isLocked;
```

Add one line after `isLocked`:

```typescript
  if (body.seasonalityData !== undefined) updateData.seasonalityData = body.seasonalityData;
```

- [ ] **Step 2: Verify the API route file includes the import for seasonalityData**

The existing import `import { forecastToolVersions, forecastToolAsins } from "@/lib/db/schema"` already covers the table. Drizzle handles the new column automatically since `updateData` is `Record<string, unknown>` passed to `.set()`. No import changes needed.

- [ ] **Step 3: Test manually**

Run: `PORT=3000 npm run dev`

Test with curl (replace `VERSION_ID` with a real ID from the DB):
```bash
curl -X PUT http://localhost:3000/api/ppc/forecast-tool/versions/VERSION_ID \
  -H "Content-Type: application/json" \
  -d '{"seasonalityData": {"keywords": ["test"], "coefficients": {"01": 0.1}, "rawSearchVolume": {}}}'
```

Expected: 200 response with updated version including `seasonalityData`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ppc/forecast-tool/versions/\[id\]/route.ts
git commit -m "feat(forecast): accept seasonalityData in version PUT endpoint"
```

---

### Task 3: Seasonality Step Component

**Files:**
- Create: `src/components/ppc/forecast-tool/seasonality-step.tsx`

This is the main new component — a 4-phase wizard. All CSV parsing happens client-side. 

- [ ] **Step 1: Create the component file with types and phase state**

Create `src/components/ppc/forecast-tool/seasonality-step.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Upload, Check, ArrowRight, SkipForward } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeasonalityData {
  keywords: string[];
  coefficients: Record<string, number>; // "01"-"12" → decimal coef
  rawSearchVolume: Record<string, { date: string; volume: number }[]>;
}

interface SeasonalityStepProps {
  versionId: string;
  asins: string[];           // ASIN codes for the copy block
  brandName: string;         // for filtering branded keywords
  forecastStart: string;     // e.g., "2026-04"
  forecastEnd: string;       // e.g., "2026-12"
  existingData?: SeasonalityData | null;
  onComplete: () => void;    // navigate to grid
  onSkip: () => void;        // skip → grid with coef=0
}

type Phase = "copy" | "cerebro" | "volumes" | "review";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ---------------------------------------------------------------------------
// CSV Parsing Helpers
// ---------------------------------------------------------------------------

/** Parse a basic CSV string into rows of key-value objects using the header row */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });
}

/** Parse date string like "1/7/23 0:00" or "1/7/2023 0:00" into a Date */
function parseSearchVolumeDate(dateStr: string): Date | null {
  const cleaned = dateStr.replace(/\s+\d+:\d+$/, ""); // strip time
  const parts = cleaned.split("/");
  if (parts.length !== 3) return null;
  let [m, d, y] = parts.map(Number);
  if (y < 100) y += 2000; // 23 → 2023
  return new Date(y, m - 1, d);
}

/** 
 * Compute monthly seasonality coefficients from weekly search volume data.
 * Uses last 2 years, averages same months across years, then:
 * coef[month] = (month_avg - yearly_avg) / yearly_avg
 */
function computeCoefficients(
  data: { date: string; volume: number }[]
): Record<string, number> {
  if (data.length === 0) return {};

  // Find latest date, filter to last 24 months
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = new Date(sorted[sorted.length - 1].date);
  const cutoff = new Date(latestDate);
  cutoff.setMonth(cutoff.getMonth() - 24);

  const filtered = sorted.filter((d) => new Date(d.date) >= cutoff);

  // Group by year-month, sum weekly volumes
  const monthlyTotals: Record<string, number> = {}; // "2023-01" → total
  for (const entry of filtered) {
    const d = new Date(entry.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTotals[key] = (monthlyTotals[key] || 0) + entry.volume;
  }

  // Average same months across years: group by month number
  const monthSums: Record<string, number[]> = {}; // "01" → [val2023, val2024]
  for (const [ym, total] of Object.entries(monthlyTotals)) {
    const mm = ym.split("-")[1];
    if (!monthSums[mm]) monthSums[mm] = [];
    monthSums[mm].push(total);
  }

  const monthAvgs: Record<string, number> = {};
  for (const [mm, vals] of Object.entries(monthSums)) {
    monthAvgs[mm] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // Yearly average across all month averages
  const allAvgs = Object.values(monthAvgs);
  const yearlyAvg = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length;

  if (yearlyAvg === 0) return {};

  // Coefficient per month
  const coefficients: Record<string, number> = {};
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const avg = monthAvgs[mm] || yearlyAvg; // fallback to yearly if no data for that month
    coefficients[mm] = (avg - yearlyAvg) / yearlyAvg;
  }

  return coefficients;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SeasonalityStep({
  versionId,
  asins,
  brandName,
  forecastStart,
  forecastEnd,
  existingData,
  onComplete,
  onSkip,
}: SeasonalityStepProps) {
  // Phase navigation — if re-entering with existing data, start at review
  const [phase, setPhase] = useState<Phase>(existingData ? "review" : "copy");

  // State accumulated across phases
  const [copied, setCopied] = useState(false);
  const [cerebroKeywords, setCerebroKeywords] = useState<{ keyword: string; volume: number }[]>([]);
  const [selectedKeywordIdxs, setSelectedKeywordIdxs] = useState<Set<number>>(new Set());
  const [keywordCoefs, setKeywordCoefs] = useState<Record<string, Record<string, number>>>({}); // keyword → { "01": coef }
  const [rawVolumes, setRawVolumes] = useState<Record<string, { date: string; volume: number }[]>>(
    existingData?.rawSearchVolume || {}
  );
  const [uploadedCount, setUploadedCount] = useState(0);

  const selectedKeywords = useMemo(() => {
    if (existingData?.keywords && phase === "review") return existingData.keywords;
    return [...selectedKeywordIdxs].sort((a, b) => a - b).map((i) => cerebroKeywords[i]?.keyword).filter(Boolean);
  }, [selectedKeywordIdxs, cerebroKeywords, existingData, phase]);

  // Merged coefficients: average across all keyword coefs
  const mergedCoefficients = useMemo((): Record<string, number> => {
    if (existingData?.coefficients && Object.keys(keywordCoefs).length === 0) {
      return existingData.coefficients;
    }
    const allCoefs = Object.values(keywordCoefs);
    if (allCoefs.length === 0) return {};
    const merged: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      const vals = allCoefs.map((c) => c[mm] || 0);
      merged[mm] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return merged;
  }, [keywordCoefs, existingData]);

  // Generate forecast month strings for writing cells
  const forecastMonthStrings = useMemo(() => {
    const months: string[] = [];
    const [sy, sm] = forecastStart.split("-").map(Number);
    const [ey, em] = forecastEnd.split("-").map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months;
  }, [forecastStart, forecastEnd]);

  // Save mutation: persist seasonality data + write category_coef cells
  const saveSeasonality = useMutation({
    mutationFn: async () => {
      const seasonalityData: SeasonalityData = {
        keywords: selectedKeywords,
        coefficients: mergedCoefficients,
        rawSearchVolume: rawVolumes,
      };

      // 1. Save seasonality data on version
      const versionRes = await fetch(`/api/ppc/forecast-tool/versions/${versionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonalityData }),
      });
      if (!versionRes.ok) throw new Error("Failed to save seasonality data");

      // 2. Write category_coef cells for each forecast month
      const cells = forecastMonthStrings.map((month) => {
        const mm = month.split("-")[1]; // "2026-04" → "04"
        return { month, metric: "category_coef", value: mergedCoefficients[mm] ?? 0 };
      });
      const cellsRes = await fetch("/api/ppc/forecast-tool/cells", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, cells }),
      });
      if (!cellsRes.ok) throw new Error("Failed to save coefficient cells");
    },
    onSuccess: () => onComplete(),
  });

  // --- Phase: Copy ASINs ---
  const asinText = asins.join(" ");

  const handleCopy = () => {
    navigator.clipboard.writeText(asinText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Phase: Cerebro CSV ---
  const handleCerebroUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      const brand = (brandName || "").toLowerCase();

      const keywords = rows
        .map((r) => ({
          keyword: r["Keyword"] || r["keyword"] || "",
          volume: parseInt(r["Search Volume"] || r["search volume"] || "0", 10),
        }))
        .filter((k) => k.keyword && k.volume >= 1000)
        .filter((k) => !brand || !k.keyword.toLowerCase().includes(brand))
        .filter((k) => k.keyword.split(/\s+/).length < 5)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);

      setCerebroKeywords(keywords);
      // Pre-select top 3
      setSelectedKeywordIdxs(new Set([0, 1, 2].filter((i) => i < keywords.length)));
    };
    reader.readAsText(file);
  };

  const toggleKeyword = (idx: number) => {
    setSelectedKeywordIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else if (next.size < 3) next.add(idx);
      return next;
    });
  };

  // --- Phase: Historical Volume CSVs ---
  const handleVolumeUpload = (keyword: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      const entries: { date: string; volume: number }[] = [];

      for (const row of rows) {
        const dateStr = row["Time"] || row["time"] || "";
        const vol = parseInt(row["Search Volume"] || row["search volume"] || "0", 10);
        const parsed = parseSearchVolumeDate(dateStr);
        if (parsed && !isNaN(vol)) {
          entries.push({
            date: parsed.toISOString().slice(0, 10),
            volume: vol,
          });
        }
      }

      setRawVolumes((prev) => ({ ...prev, [keyword]: entries }));
      const coefs = computeCoefficients(entries);
      setKeywordCoefs((prev) => ({ ...prev, [keyword]: coefs }));
      setUploadedCount((c) => c + 1);
    };
    reader.readAsText(file);
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Seasonality Analysis</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {phase === "copy" && "Step 1 of 4 — Copy ASINs for Cerebro"}
            {phase === "cerebro" && "Step 2 of 4 — Select keywords from Cerebro export"}
            {phase === "volumes" && "Step 3 of 4 — Upload historical search volume"}
            {phase === "review" && "Step 4 of 4 — Review & apply coefficients"}
          </p>
        </div>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipForward className="h-4 w-4" />
          Skip — use flat seasonality
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {(["copy", "cerebro", "volumes", "review"] as Phase[]).map((p, i) => (
          <div
            key={p}
            className={`h-1 flex-1 rounded-full transition-colors ${
              (["copy", "cerebro", "volumes", "review"] as Phase[]).indexOf(phase) >= i
                ? "bg-brand"
                : "bg-zinc-200 dark:bg-zinc-700"
            }`}
          />
        ))}
      </div>

      {/* Phase: Copy ASINs */}
      {phase === "copy" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <p className="text-sm">
              Paste these ASINs into{" "}
              <span className="font-semibold">Helium 10 Cerebro</span>, run the
              reverse lookup, and export the results as CSV. Then upload the CSV
              in the next step.
            </p>
            <div className="relative">
              <pre className="rounded-md bg-zinc-100 dark:bg-zinc-800 p-3 text-xs font-mono whitespace-pre-wrap break-all select-all">
                {asinText}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 rounded-md bg-white dark:bg-zinc-700 border border-border px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors flex items-center gap-1"
              >
                {copied ? <><Check className="h-3 w-3 text-green-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{asins.length} ASINs selected</p>
          </div>
          <button
            onClick={() => setPhase("cerebro")}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-foreground hover:bg-brand-hover transition-colors"
          >
            Next — Upload Cerebro CSV <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Phase: Cerebro Upload */}
      {phase === "cerebro" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Upload Cerebro CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCerebroUpload}
                className="block w-full text-sm text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:font-medium file:bg-zinc-50 dark:file:bg-zinc-800 file:cursor-pointer hover:file:bg-zinc-100"
              />
            </div>

            {cerebroKeywords.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Select exactly 3 keywords ({selectedKeywordIdxs.size}/3)
                </p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="w-8 py-1.5 text-left"></th>
                      <th className="py-1.5 text-left font-semibold">Keyword</th>
                      <th className="py-1.5 text-right font-semibold">Search Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cerebroKeywords.map((kw, i) => (
                      <tr
                        key={i}
                        className={`border-b border-zinc-100 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                          selectedKeywordIdxs.has(i) ? "" : "opacity-50"
                        }`}
                        onClick={() => toggleKeyword(i)}
                      >
                        <td className="py-1.5 px-1">
                          <input
                            type="checkbox"
                            checked={selectedKeywordIdxs.has(i)}
                            readOnly
                            className="rounded border-stone-300 pointer-events-none"
                          />
                        </td>
                        <td className="py-1.5">{kw.keyword}</td>
                        <td className="py-1.5 text-right font-mono">{kw.volume.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPhase("copy")}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setPhase("volumes")}
              disabled={selectedKeywordIdxs.size !== 3}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                selectedKeywordIdxs.size === 3
                  ? "bg-brand text-brand-foreground hover:bg-brand-hover"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500"
              }`}
            >
              Next — Upload Search Volumes <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Phase: Historical Volume Uploads */}
      {phase === "volumes" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <p className="text-sm">
              Upload historical search volume CSVs (from Google Trends or similar) for each keyword.
              Each file should have <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">Time</code> and{" "}
              <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">Search Volume</code> columns with weekly data.
            </p>

            {selectedKeywords.map((keyword) => (
              <div key={keyword} className="flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{keyword}</p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleVolumeUpload(keyword, e)}
                    className="mt-1 block w-full text-xs text-zinc-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-border file:text-[10px] file:font-medium file:bg-zinc-50 dark:file:bg-zinc-800 file:cursor-pointer"
                  />
                </div>
                {rawVolumes[keyword] && (
                  <span className="text-xs text-green-600 flex items-center gap-1 shrink-0">
                    <Check className="h-3 w-3" /> {rawVolumes[keyword].length} rows
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPhase("cerebro")}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setPhase("review")}
              disabled={selectedKeywords.some((kw) => !rawVolumes[kw])}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                selectedKeywords.every((kw) => rawVolumes[kw])
                  ? "bg-brand text-brand-foreground hover:bg-brand-hover"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500"
              }`}
            >
              Next — Review Coefficients <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Phase: Review & Apply */}
      {phase === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="py-2 text-left font-semibold min-w-[140px]">Keyword</th>
                  {MONTH_LABELS.map((label, i) => (
                    <th key={i} className="py-2 text-right font-semibold px-2 min-w-[55px]">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedKeywords.map((keyword) => {
                  const coefs = keywordCoefs[keyword] || existingData?.coefficients || {};
                  return (
                    <tr key={keyword} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 truncate max-w-[140px]" title={keyword}>{keyword}</td>
                      {MONTH_LABELS.map((_, i) => {
                        const mm = String(i + 1).padStart(2, "0");
                        const val = coefs[mm];
                        return (
                          <td
                            key={mm}
                            className={`py-2 text-right px-2 font-mono ${
                              val != null && val > 0 ? "text-green-700" : val != null && val < 0 ? "text-red-600" : ""
                            }`}
                          >
                            {val != null ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(1)}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Merged row */}
                <tr className="border-t-2 border-zinc-300 dark:border-zinc-600 font-bold">
                  <td className="py-2">Category Coef</td>
                  {MONTH_LABELS.map((_, i) => {
                    const mm = String(i + 1).padStart(2, "0");
                    const val = mergedCoefficients[mm];
                    return (
                      <td
                        key={mm}
                        className={`py-2 text-right px-2 font-mono ${
                          val != null && val > 0 ? "text-green-700" : val != null && val < 0 ? "text-red-600" : ""
                        }`}
                      >
                        {val != null ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(1)}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            These coefficients will populate the Category Coef row in the forecast grid. You can fine-tune individual months there.
          </p>

          <div className="flex gap-2">
            {!existingData && (
              <button
                onClick={() => setPhase("volumes")}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => saveSeasonality.mutate()}
              disabled={saveSeasonality.isPending || Object.keys(mergedCoefficients).length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand-green px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saveSeasonality.isPending ? "Saving…" : "Apply to Forecast"}
            </button>
            {saveSeasonality.isError && (
              <span className="text-xs text-red-500 self-center">
                {(saveSeasonality.error as Error)?.message || "Save failed"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `PORT=3000 npm run dev`

Check for TypeScript errors in the terminal. The component is not wired into the page yet, so no visual test — just confirm no compile errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ppc/forecast-tool/seasonality-step.tsx
git commit -m "feat(forecast): add SeasonalityStep component with 4-phase wizard"
```

---

### Task 4: Page Routing — Wire SeasonalityStep into the Workflow

**Files:**
- Modify: `src/app/sales-summary/forecast-v2/page.tsx`
- Modify: `src/components/ppc/forecast-tool/forecast-grid.tsx:87-101,139,1384-1454`

- [ ] **Step 1: Add "Edit Seasonality" prop to ForecastGrid**

In `src/components/ppc/forecast-tool/forecast-grid.tsx`, add `onEditSeasonality` to the props interface (around line 87-101):

Find:
```typescript
  isLocked?: boolean;
  onForecastStartChange: (v: string) => void;
  onForecastEndChange: (v: string) => void;
  onHistoricStartChange: (v: string) => void;
}
```

Replace with:
```typescript
  isLocked?: boolean;
  onEditSeasonality?: () => void;
  onForecastStartChange: (v: string) => void;
  onForecastEndChange: (v: string) => void;
  onHistoricStartChange: (v: string) => void;
}
```

- [ ] **Step 2: Add onEditSeasonality to destructured props**

Find the function signature on line 139:

```typescript
export function ForecastGrid({ versionId, cells, asins, asinCells, asinHistorical, historical, allMonths, forecastStart, forecastEnd, historicStart, isLocked, onForecastStartChange, onForecastEndChange, onHistoricStartChange }: ForecastGridProps) {
```

Replace with:
```typescript
export function ForecastGrid({ versionId, cells, asins, asinCells, asinHistorical, historical, allMonths, forecastStart, forecastEnd, historicStart, isLocked, onEditSeasonality, onForecastStartChange, onForecastEndChange, onHistoricStartChange }: ForecastGridProps) {
```

- [ ] **Step 3: Add "Edit Seasonality" button in the grid toolbar**

In the grid toolbar area (around line 1446-1453), find:

```tsx
        {saveCells.isPending && (
          <span className="text-xs text-zinc-400 animate-pulse">Saving…</span>
        )}
        {saveCells.isError && (
          <span className="text-xs text-red-500">Save failed</span>
        )}
```

Replace with:
```tsx
        {onEditSeasonality && (
          <button
            onClick={onEditSeasonality}
            className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted transition-colors"
          >
            Edit Seasonality
          </button>
        )}

        {saveCells.isPending && (
          <span className="text-xs text-zinc-400 animate-pulse">Saving…</span>
        )}
        {saveCells.isError && (
          <span className="text-xs text-red-500">Save failed</span>
        )}
```

- [ ] **Step 4: Wire SeasonalityStep into the page component**

In `src/app/sales-summary/forecast-v2/page.tsx`, make these changes:

**4a. Add import** — at the top, after the existing imports:

```typescript
import { SeasonalityStep } from "@/components/ppc/forecast-tool/seasonality-step";
```

**4b. Add showSeasonality state** — inside `ForecastToolContent`, after the `activeVersionId` state (around line 32):

Find:
```typescript
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
```

Replace with:
```typescript
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [showSeasonality, setShowSeasonality] = useState(false);
```

**4c. Modify version creation to redirect to seasonality** — in the `VersionManager` component's `onVersionChange` handler (around line 220-225):

Find:
```typescript
          <VersionManager
            clientIdCode={clientIdCode}
            versions={data.versions || []}
            activeVersionId={activeVersionId}
            onVersionChange={(versionId, periods) => {
              setActiveVersionId(versionId);
              if (periods?.historicStart) setHistoricStart(periods.historicStart);
              if (periods?.forecastStart) setForecastStart(periods.forecastStart);
              if (periods?.forecastEnd) setForecastEnd(periods.forecastEnd);
            }}
          />
```

Replace with:
```typescript
          <VersionManager
            clientIdCode={clientIdCode}
            versions={data.versions || []}
            activeVersionId={activeVersionId}
            onVersionChange={(versionId, periods) => {
              const isNewVersion = !activeVersionId || activeVersionId !== versionId;
              setActiveVersionId(versionId);
              if (periods?.historicStart) setHistoricStart(periods.historicStart);
              if (periods?.forecastStart) setForecastStart(periods.forecastStart);
              if (periods?.forecastEnd) setForecastEnd(periods.forecastEnd);
              // Show seasonality step for newly created versions
              if (isNewVersion && !data.versions?.find((v: { id: string }) => v.id === versionId)) {
                setShowSeasonality(true);
              }
            }}
          />
```

**4d. Add SeasonalityStep rendering between the version manager and forecast grid** — find the forecast grid rendering block (around line 236-254):

Find:
```tsx
      {data?.activeVersion && (
        <ForecastGrid
          key={data.activeVersion.id}
          versionId={data.activeVersion.id}
          cells={data.cells}
          asins={data.asins}
          asinCells={data.asinCells || []}
          asinHistorical={data.asinHistorical || {}}
          historical={data.historical}
          allMonths={allMonths}
          forecastStart={forecastStart}
          forecastEnd={forecastEnd}
          historicStart={historicStart}
          isLocked={data.activeVersion.isLocked}
          onForecastStartChange={setForecastStart}
          onForecastEndChange={setForecastEnd}
          onHistoricStartChange={setHistoricStart}
        />
      )}
```

Replace with:
```tsx
      {data?.activeVersion && showSeasonality && (
        <SeasonalityStep
          versionId={data.activeVersion.id}
          asins={(data.asins || []).map((a: { asin: string | null }) => a.asin).filter(Boolean)}
          brandName={clients.find(c => c.clientIdCode === clientIdCode)?.brandName || ""}
          forecastStart={forecastStart}
          forecastEnd={forecastEnd}
          existingData={data.activeVersion.seasonalityData || null}
          onComplete={() => {
            setShowSeasonality(false);
            queryClient.invalidateQueries({ queryKey: ["forecast-tool", clientIdCode] });
          }}
          onSkip={() => setShowSeasonality(false)}
        />
      )}

      {data?.activeVersion && !showSeasonality && (
        <ForecastGrid
          key={data.activeVersion.id}
          versionId={data.activeVersion.id}
          cells={data.cells}
          asins={data.asins}
          asinCells={data.asinCells || []}
          asinHistorical={data.asinHistorical || {}}
          historical={data.historical}
          allMonths={allMonths}
          forecastStart={forecastStart}
          forecastEnd={forecastEnd}
          historicStart={historicStart}
          isLocked={data.activeVersion.isLocked}
          onEditSeasonality={() => setShowSeasonality(true)}
          onForecastStartChange={setForecastStart}
          onForecastEndChange={setForecastEnd}
          onHistoricStartChange={setHistoricStart}
        />
      )}
```

**4e. Add queryClient** — the `onComplete` callback uses `queryClient`. Add it inside `ForecastToolContent`:

Find:
```typescript
  const searchParams = useSearchParams();
```

Replace with:
```typescript
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
```

And add the import at the top — find:
```typescript
import { useQuery } from "@tanstack/react-query";
```

Replace with:
```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
```

- [ ] **Step 5: Verify the full flow**

Run: `PORT=3000 npm run dev`

1. Open http://localhost:3000/sales-summary/forecast-v2
2. Click a client card
3. Click "+ New Version", name it, select ASINs, create
4. Verify the Seasonality Step appears (phase 1: copy ASINs)
5. Click "Skip — use flat seasonality"
6. Verify the forecast grid appears
7. Click "Edit Seasonality" in the grid toolbar
8. Verify the seasonality step reappears

- [ ] **Step 6: Commit**

```bash
git add src/app/sales-summary/forecast-v2/page.tsx src/components/ppc/forecast-tool/forecast-grid.tsx
git commit -m "feat(forecast): wire SeasonalityStep into page routing with Edit Seasonality re-entry"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] New version creation → seasonality step appears
- [ ] Copy button copies space-separated ASINs to clipboard
- [ ] Cerebro CSV upload parses keywords, filters branded/long-tail/low-volume
- [ ] Keyword table shows top 10, top 3 pre-selected, exactly 3 required
- [ ] Historical search volume CSVs parse correctly (weekly → monthly → coefficients)
- [ ] Review table shows per-keyword and merged coefficients
- [ ] "Apply to Forecast" saves seasonality_data JSONB and writes category_coef cells
- [ ] Grid shows correct Category Coef values after apply
- [ ] "Skip" bypasses seasonality and shows grid with coef=0
- [ ] "Edit Seasonality" from grid re-enters step 4 (review) with existing data
- [ ] Switching between versions does NOT show seasonality step (only new creation does)
- [ ] Build passes: `npm run build`
