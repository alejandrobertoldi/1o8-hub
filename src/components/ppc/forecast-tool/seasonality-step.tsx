/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/query-mutation-missing-invalidation */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";
/* eslint-disable react-doctor/nextjs-no-img-element */

import { useState, useMemo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Check, ArrowRight, SkipForward } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeasonalityData {
  keywords: string[];
  coefficients: Record<string, number>; // "01"-"12" → decimal coef
  rawSearchVolume: Record<string, { date: string; volume: number }[]>;
  cerebroKeywords?: { keyword: string; volume: number }[]; // stored for re-entry
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

/** Split a CSV line respecting quoted fields (handles commas inside quotes) */
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse a CSV string into rows of key-value objects using the header row */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });
}

/** Parse date string — handles "1/7/23 0:00", "1/7/2023 0:00", "2021-04-17 00:00:00" */
function parseSearchVolumeDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();
  // ISO-style: "2021-04-17" or "2021-04-17 00:00:00"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  // US-style: "1/7/23 0:00" or "1/7/2023 0:00"
  const cleaned = trimmed.replace(/\s+\d+:\d+(:\d+)?$/, "");
  const parts = cleaned.split("/");
  if (parts.length !== 3) return null;
  let [m, d, y] = parts.map(Number);
  if (y < 100) y += 2000;
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
  const sorted = data.toSorted((a, b) => a.date.localeCompare(b.date));
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
  const [cerebroKeywords, setCerebroKeywords] = useState<{ keyword: string; volume: number }[]>(
    existingData?.cerebroKeywords || []
  );
  const [selectedKeywordIdxs, setSelectedKeywordIdxs] = useState<Set<number>>(() => {
    if (existingData?.cerebroKeywords && existingData?.keywords) {
      const idxs = new Set<number>();
      for (const kw of existingData.keywords) {
        const idx = existingData.cerebroKeywords.findIndex((c) => c.keyword === kw);
        if (idx >= 0) idxs.add(idx);
      }
      return idxs;
    }
    return new Set();
  });
  const [keywordCoefs, setKeywordCoefs] = useState<Record<string, Record<string, number>>>(() => {
    // Recompute per-keyword coefficients from saved raw volumes on re-entry
    if (existingData?.rawSearchVolume) {
      const coefs: Record<string, Record<string, number>> = {};
      for (const [kw, entries] of Object.entries(existingData.rawSearchVolume)) {
        coefs[kw] = computeCoefficients(entries);
      }
      return coefs;
    }
    return {};
  }); // keyword → { "01": coef }
  const [rawVolumes, setRawVolumes] = useState<Record<string, { date: string; volume: number }[]>>(
    existingData?.rawSearchVolume || {}
  );
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const selectedKeywords = useMemo(() => {
    if (existingData?.keywords && phase === "review") return existingData.keywords;
    return Array.from(selectedKeywordIdxs).toSorted((a, b) => a - b).map((i) => cerebroKeywords[i]?.keyword).filter(Boolean);
  }, [selectedKeywordIdxs, cerebroKeywords, existingData, phase]);

  // Which coefficient source to apply: "merged" or a specific keyword
  const [activeCoefSource, setActiveCoefSource] = useState<string>("merged");

  // Chart: hidden series toggle + hover tooltip
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ x: number; y: number; monthIdx: number; entries: { label: string; value: number; color: string }[] } | null>(null);
  const toggleSeriesVisibility = useCallback((label: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

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

  // Active coefficients used for saving — based on user's row selection
  const activeCoefficients = useMemo((): Record<string, number> => {
    if (activeCoefSource === "merged") return mergedCoefficients;
    return keywordCoefs[activeCoefSource] || existingData?.coefficients || {};
  }, [activeCoefSource, mergedCoefficients, keywordCoefs, existingData]);

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
        coefficients: activeCoefficients,
        rawSearchVolume: rawVolumes,
        cerebroKeywords,
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
        return { month, metric: "category_coef", value: activeCoefficients[mm] ?? 0 };
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

  // --- Phase: Copy ASINs (deduplicated — multiple SKUs can share one ASIN) ---
  const uniqueAsins = [...new Set(asins)];
  const asinText = uniqueAsins.join("\n");

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
      if (rows.length === 0) return;
      const brand = (brandName || "").toLowerCase();

      // Flexible column matching for Cerebro CSV headers
      const sampleKeys = Object.keys(rows[0]);
      const kwCol = sampleKeys.find((k) => /^keyword(\s+phrase)?$/i.test(k)) || sampleKeys.find((k) => k.toLowerCase().includes("keyword")) || "";
      const volCol = sampleKeys.find((k) => /^search volume$/i.test(k)) || sampleKeys.find((k) => k.toLowerCase().includes("search volume") && !k.toLowerCase().includes("trend")) || "";

      const keywords = rows
        .map((r) => ({
          keyword: r[kwCol] || "",
          volume: parseInt((r[volCol] || "0").replace(/,/g, ""), 10),
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
          <h2 className="text-2xl tracking-tight"><span className="font-bold text-[#F7BF1D]">Seasonality</span><span className="font-normal">Analysis</span></h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {phase === "copy" && "Step 1 of 4 — Copy ASINs for Cerebro"}
            {phase === "cerebro" && "Step 2 of 4 — Select keywords from Cerebro export"}
            {phase === "volumes" && "Step 3 of 4 — Upload historical search volume"}
            {phase === "review" && "Step 4 of 4 — Review & apply seasonality coefficients"}
          </p>
        </div>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipForward className="size-4" />
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
              <pre className="rounded-md bg-zinc-100 dark:bg-zinc-800 p-3 text-xs font-mono whitespace-pre select-all">
                {asinText}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 rounded-md bg-white dark:bg-zinc-700 border border-border px-2 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors flex items-center gap-1"
              >
                {copied ? <><Check className="size-3 text-green-600" /> Copied</> : <><Copy className="size-3" /> Copy</>}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{uniqueAsins.length} unique ASIN{uniqueAsins.length !== 1 ? "s" : ""}{uniqueAsins.length !== asins.length ? ` (from ${asins.length} products)` : ""}</p>
          </div>
          <button
            onClick={() => setPhase("cerebro")}
            className="flex items-center gap-1.5 rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover transition-colors"
          >
            Next — Upload Cerebro CSV <ArrowRight className="size-4" />
          </button>
        </div>
      )}

      {/* Phase: Cerebro Upload */}
      {phase === "cerebro" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Upload Cerebro CSV</label>
              {cerebroKeywords.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-600 flex items-center gap-1"><Check className="size-3" /> {cerebroKeywords.length} keywords loaded</span>
                  <label className="text-xs text-muted-foreground hover:text-foreground cursor-pointer underline">
                    Re-upload
                    <input type="file" accept=".csv" onChange={handleCerebroUpload} className="hidden" />
                  </label>
                </div>
              ) : (
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCerebroUpload}
                  className="block w-full text-sm text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:font-medium file:bg-zinc-50 dark:file:bg-zinc-800 file:cursor-pointer hover:file:bg-zinc-100"
                />
              )}
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
                  ? "bg-brand-solid text-white hover:bg-brand-solid-hover"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500"
              }`}
            >
              Next — Upload Search Volumes <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Phase: Historical Volume Uploads */}
      {phase === "volumes" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <p className="text-sm">
              For each keyword, download the search volume CSV from <span className="font-semibold">Helium 10</span>:
            </p>
            <div className="flex gap-3 items-start">
              {[
                { src: "/season_step1.png?v=2", alt: "Click chart icon next to Search Volume", caption: "1. Click the chart icon (📈)" },
                { src: "/season_step2.png?v=2", alt: "Set 5 Years range, then Download CSV", caption: '2. Set 5 Years → ≡ → Download CSV' },
              ].map((img) => (
                <div key={img.src} className="relative text-center space-y-0.5">
                  <img
                    src={img.src}
                    alt={img.alt}
                    className="rounded border border-border w-20 h-16 object-cover cursor-zoom-in"
                    onMouseEnter={() => setPreviewImg(img.src)}
                    onMouseLeave={() => setPreviewImg(null)}
                  />
                  <p className="text-[9px] text-muted-foreground leading-tight">{img.caption}</p>
                </div>
              ))}
            </div>
            {previewImg && (
              <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center pointer-events-none">
                <img src={previewImg} alt="Preview" className="max-w-[80vw] max-h-[80vh] rounded-lg shadow-2xl border border-border" />
              </div>
            )}

            {selectedKeywords.map((keyword) => (
              <div key={keyword} className="flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{keyword}</p>
                  {rawVolumes[keyword] ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-green-600 flex items-center gap-1"><Check className="size-3" /> {rawVolumes[keyword].length} rows loaded</span>
                      <label className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer underline">
                        Re-upload
                        <input type="file" accept=".csv" onChange={(e) => handleVolumeUpload(keyword, e)} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleVolumeUpload(keyword, e)}
                      className="mt-1 block w-full text-xs text-zinc-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-border file:text-[10px] file:font-medium file:bg-zinc-50 dark:file:bg-zinc-800 file:cursor-pointer"
                    />
                  )}
                </div>
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
                  ? "bg-brand-solid text-white hover:bg-brand-solid-hover"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-700 dark:text-zinc-500"
              }`}
            >
              Next — Review Coefficients <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Phase: Review & Apply */}
      {phase === "review" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-2 text-foreground">
            {/* SVG line chart — aligned with table columns */}
            {Object.keys(mergedCoefficients).length > 0 && (() => {
              const LINE_COLORS = ["#f59e0b", "#3b82f6", "#10b981"]; // amber, blue, green
              const MERGED_COLOR = "#ef4444"; // red for merged/avg
              const allSeries = [
                ...selectedKeywords.map((kw, i) => ({ label: kw, coefs: keywordCoefs[kw] || {}, color: LINE_COLORS[i % LINE_COLORS.length], isMerged: false })),
                { label: "Average", coefs: mergedCoefficients, color: MERGED_COLOR, isMerged: true },
              ];
              const allVals = allSeries.flatMap((s) => Object.values(s.coefs));
              const maxAbs = Math.max(...allVals.map(Math.abs), 0.01);
              const chartW = 1000;
              const labelPct = 0.15;
              const labelW = chartW * labelPct;
              const dataW = chartW - labelW;
              const colW = dataW / 12;
              const chartH = 230;
              const padY = 20;
              const toX = (i: number) => labelW + colW * i + colW / 2;
              const toY = (val: number) => padY + ((chartH - 2 * padY) / 2) * (1 - val / maxAbs);

              return (
                <div>
                  <div className="flex items-center gap-3 mb-1.5">
                    <p className="text-xs text-foreground font-medium">Seasonality Comparison</p>
                    {allSeries.map((series) => (
                      <label key={series.label} className="flex items-center gap-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!hiddenSeries.has(series.label)}
                          onChange={() => toggleSeriesVisibility(series.label)}
                          className="rounded border-stone-300 accent-brand size-3"
                        />
                        <span
                          className="inline-block w-3 rounded-full shrink-0"
                          style={{ backgroundColor: series.color, height: series.isMerged ? 3 : 2 }}
                        />
                        <span className="text-[10px] text-foreground">
                          {series.label.length > 20 ? series.label.slice(0, 20) + "…" : series.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    className="w-full"
                    style={{ maxHeight: 260 }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {/* Baseline */}
                    <line x1={labelW} y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="currentColor" strokeOpacity={0.6} strokeDasharray="8 4" />
                    {/* Grid lines per month */}
                    {MONTH_LABELS.map((_, i) => (
                      <line key={i} x1={toX(i)} y1={padY} x2={toX(i)} y2={chartH - padY} stroke="currentColor" strokeOpacity={0.6} strokeWidth={0.5} />
                    ))}
                    {/* Smooth lines per series */}
                    {allSeries.map((series) => {
                      if (hiddenSeries.has(series.label)) return null;
                      const pts = MONTH_LABELS.map((_, i) => {
                        const mm = String(i + 1).padStart(2, "0");
                        return { x: toX(i), y: toY(series.coefs[mm] ?? 0) };
                      });
                      // Build smooth cubic bezier path
                      let d = `M${pts[0].x},${pts[0].y}`;
                      for (let i = 0; i < pts.length - 1; i++) {
                        const p0 = pts[Math.max(i - 1, 0)];
                        const p1 = pts[i];
                        const p2 = pts[i + 1];
                        const p3 = pts[Math.min(i + 2, pts.length - 1)];
                        const tension = 0.13;
                        const cp1x = p1.x + (p2.x - p0.x) * tension;
                        const cp1y = p1.y + (p2.y - p0.y) * tension;
                        const cp2x = p2.x - (p3.x - p1.x) * tension;
                        const cp2y = p2.y - (p3.y - p1.y) * tension;
                        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
                      }
                      return (
                        <path
                          key={series.label}
                          d={d}
                          fill="none"
                          stroke={series.color}
                          strokeWidth={series.isMerged ? 2.5 : 1.5}
                          strokeLinejoin="round"
                          opacity={activeCoefSource === "merged" ? 1 : (activeCoefSource === series.label || series.isMerged ? 1 : 0.3)}
                        />
                      );
                    })}
                    {/* Data point dots */}
                    {allSeries.map((series) => {
                      if (hiddenSeries.has(series.label)) return null;
                      return MONTH_LABELS.map((_, i) => {
                        const mm = String(i + 1).padStart(2, "0");
                        const val = series.coefs[mm] ?? 0;
                        const isHighlighted = activeCoefSource === "merged" || activeCoefSource === series.label || series.isMerged;
                        return (
                          <circle
                            key={`${series.label}-${i}`}
                            cx={toX(i)}
                            cy={toY(val)}
                            r={isHighlighted ? 3.5 : 2}
                            fill={series.color}
                            opacity={tooltip?.monthIdx === i ? 1 : (isHighlighted ? 0.8 : 0.25)}
                            className="pointer-events-none"
                          />
                        );
                      });
                    })}
                    {/* Hover highlight line */}
                    {tooltip && (
                      <line x1={toX(tooltip.monthIdx)} y1={padY} x2={toX(tooltip.monthIdx)} y2={chartH - padY} stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} />
                    )}
                    {/* Invisible vertical hit areas per month */}
                    {MONTH_LABELS.map((_, i) => (
                      <rect
                        key={`hit-${i}`}
                        x={toX(i) - colW / 2}
                        y={0}
                        width={colW}
                        height={chartH}
                        fill="transparent"
                        className="cursor-crosshair"
                        onMouseEnter={(e) => {
                          const svgRect = (e.target as SVGRectElement).ownerSVGElement?.getBoundingClientRect();
                          if (!svgRect) return;
                          const xPct = toX(i) / chartW;
                          const entries = allSeries
                            .filter((s) => !hiddenSeries.has(s.label))
                            .map((s) => {
                              const mm = String(i + 1).padStart(2, "0");
                              return { label: s.label, value: s.coefs[mm] ?? 0, color: s.color };
                            });
                          setTooltip({
                            x: svgRect.left + svgRect.width * xPct,
                            y: svgRect.top + 12,
                            monthIdx: i,
                            entries,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    ))}
                  </svg>
                  {/* Floating tooltip — all series for hovered month */}
                  {tooltip && (
                    <div
                      className="fixed z-50 pointer-events-none rounded-md border border-border bg-popover px-3 py-2 shadow-lg"
                      style={{ left: tooltip.x, top: tooltip.y, transform: "translateX(-50%)" }}
                    >
                      <p className="text-[11px] font-semibold mb-1 text-popover-foreground">{MONTH_LABELS[tooltip.monthIdx]}</p>
                      {tooltip.entries.map((entry) => (
                        <div key={entry.label} className="flex items-center gap-2 text-xs">
                          <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="truncate max-w-[120px] text-popover-foreground">{entry.label}</span>
                          <span className={`font-mono ml-auto ${entry.value >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {entry.value >= 0 ? "+" : ""}{(entry.value * 100).toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Table — full width, all 12 months, with radio selection */}
            <table className="w-full text-xs border-collapse table-fixed">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-semibold text-foreground" style={{ width: "15%" }}>
                    <span className="text-muted-foreground text-[10px] font-normal">Use →</span>{" "}Keyword
                  </th>
                  {MONTH_LABELS.map((label, i) => (
                    <th key={i} className="py-2 text-center font-semibold px-1">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedKeywords.map((keyword) => {
                  const coefs = keywordCoefs[keyword] || existingData?.coefficients || {};
                  const isActive = activeCoefSource === keyword;
                  return (
                    <tr key={keyword} className={`border-b border-border cursor-pointer transition-colors ${isActive ? "bg-brand/10" : "hover:bg-muted"}`} onClick={() => setActiveCoefSource(keyword)}>
                      <td className="py-2 flex items-center gap-1.5">
                        <input type="radio" name="coef-source" checked={isActive} onChange={() => setActiveCoefSource(keyword)} className="accent-[#F7BF1D] appearance-none size-3.5 rounded-full border-2 border-border checked:border-[#F7BF1D] checked:bg-[#F7BF1D] bg-white shrink-0" />
                        <span className="truncate" title={keyword}>{keyword}</span>
                      </td>
                      {MONTH_LABELS.map((_, i) => {
                        const mm = String(i + 1).padStart(2, "0");
                        const val = coefs[mm];
                        return (
                          <td key={mm} className={`py-2 text-center px-1 font-mono ${val != null && val > 0 ? "text-green-700 dark:text-green-400" : val != null && val < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                            {val != null ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(2)}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Merged (average) row */}
                <tr className={`border-t-2 border-border font-bold cursor-pointer transition-colors ${activeCoefSource === "merged" ? "bg-brand/10" : "hover:bg-muted"}`} onClick={() => setActiveCoefSource("merged")}>
                  <td className="py-2 flex items-center gap-1.5">
                    <input type="radio" name="coef-source" checked={activeCoefSource === "merged"} onChange={() => setActiveCoefSource("merged")} className="accent-[#F7BF1D] appearance-none size-3.5 rounded-full border-2 border-border checked:border-[#F7BF1D] checked:bg-[#F7BF1D] bg-white shrink-0" />
                    <span>Average</span>
                  </td>
                  {MONTH_LABELS.map((_, i) => {
                    const mm = String(i + 1).padStart(2, "0");
                    const val = mergedCoefficients[mm];
                    return (
                      <td key={mm} className={`py-2 text-center px-1 font-mono ${val != null && val > 0 ? "text-green-700 dark:text-green-400" : val != null && val < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {val != null ? `${val >= 0 ? "+" : ""}${(val * 100).toFixed(2)}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Select which keyword seasonality to apply, or use the average of all keywords.<br />You can manually fine-tune individual months in the forecast grid.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setPhase("volumes")}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => saveSeasonality.mutate()}
              disabled={saveSeasonality.isPending || Object.keys(activeCoefficients).length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-brand-green px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saveSeasonality.isPending ? "Saving…" : "Apply to Forecast"}
            </button>
            {saveSeasonality.isError && (
              <span className="text-xs text-destructive self-center">
                {(saveSeasonality.error as Error)?.message || "Save failed"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
