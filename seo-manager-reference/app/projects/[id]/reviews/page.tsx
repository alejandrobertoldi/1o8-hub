/* eslint-disable react-doctor/no-gray-on-colored-background */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { parseReviewCSV, type ReviewParseResult, type ParsedReview } from "@/lib/parsers/reviews";
import AICostTracker from "@/components/ai-cost-tracker";
import AIGeneratingButton from "@/components/ai-generating-button";
import StepNav from "@/components/step-nav";

const REVIEWS_STEPS = [
  { key: "upload", label: "S3.1 Upload CSV" },
  { key: "parsed", label: "S3.2 Parsed" },
  { key: "review", label: "S3.3 Review OUT_REV" },
  { key: "approved", label: "S3.4 Approved" },
];

interface AnalyzedReview {
  ReviewID: string;
  ReviewDate: string;
  ReviewReviewerName: string;
  ReviewASIN: string;
  ReviewProductVariation: string;
  ReviewStarRating: number;
  ReviewTitle: string;
  ReviewSentiment: string;
  ReviewKeyThemes: string;
  ReviewUsageMentioned: string;
  ReviewPackagingFeedback: string;
  ReviewPriceFeedback: string;
  ReviewHeatLevelFeedback: string;
  ReviewRufusUsableInsight: string;
  ReviewBulletMapping: string;
}

type ReviewsStep = "upload" | "parsed" | "review" | "approved";

export default function ReviewsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [step, setStep] = useState<ReviewsStep>("upload");
  const [isApproved, setIsApproved] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [loadingState, setLoadingState] = useState(true);
  const [parentAsin, setParentAsin] = useState<{ asin: string; amazon_url: string } | null>(null);
  const [parseResult, setParseResult] = useState<ReviewParseResult | null>(null);
  const [reviewFileName, setReviewFileName] = useState("");
  const [analyzedReviews, setAnalyzedReviews] = useState<AnalyzedReview[]>([]);

  // Load saved data on mount
  useEffect(() => {
    async function load() {
      try {
        // Load parent ASIN from S1
        const asinRes = await fetch(`/api/projects/${projectId}/load?phase=parent_asin`);
        if (asinRes.ok) {
          const { parent } = await asinRes.json();
          if (parent) setParentAsin(parent);
        }

        const res = await fetch(`/api/projects/${projectId}/load?phase=s3_reviews`);
        if (res.ok) {
          const { reviews } = await res.json();
          if (reviews && reviews.length > 0) {
            // Load route already maps to ReviewID etc.
            setAnalyzedReviews(reviews);
            setReviewFileName(`Saved data — ${reviews.length} reviews`);
            setIsApproved(true);
            setCompletedSteps(new Set(REVIEWS_STEPS.map((s) => s.key)));
            setStep("approved");
          }
        }
      } catch {}
      setLoadingState(false);
    }
    load();
  }, [projectId]);
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiProgress, setAiProgress] = useState("");
  const [aiStartTime, setAiStartTime] = useState<number | null>(null);
  const [aiUsage, setAiUsage] = useState<any>(null);

  // Filters
  const [starFilter, setStarFilter] = useState<string>("all");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved data on mount
  useEffect(() => {
    async function loadSaved() {
      try {
        // Load parent ASIN from S1
        const asinRes = await fetch(`/api/projects/${projectId}/load?phase=parent_asin`);
        if (asinRes.ok) {
          const { parent } = await asinRes.json();
          if (parent) setParentAsin(parent);
        }

        const res = await fetch(`/api/projects/${projectId}/load?phase=s3_reviews`);
        if (res.ok) {
          const data = await res.json();
          if (data.reviews && data.reviews.length > 0) {
            setAnalyzedReviews(data.reviews);
            setStep("approved");
          }
        }
      } catch {}
    }
    if (projectId !== "demo-1") loadSaved();
  }, [projectId]);

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReviewFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseReviewCSV(text);
      setParseResult(result);
      setStep("parsed");
    };
    reader.readAsText(file);
  }, []);

  const handleRunAI = useCallback(async () => {
    if (!parseResult) return;
    setIsRunningAI(true);
    setAiError("");
    setAiProgress(`Analyzing ${parseResult.reviews.length} reviews...`);
    setAiStartTime(Date.now());
    setAiUsage(null);

    try {
      // Pre-trim reviews client-side — keep compact for Vercel 60s limit
      const trimmed = parseResult.reviews.slice(0, 30);
      const reviewBlock = trimmed
        .map((r: any, i: number) =>
          `[${i + 1}] ${r.star_rating}★|${r.product_variation || "—"}|${r.date_iso || ""}|HV:${r.helpful_votes || 0}\n${(r.title || "").substring(0, 80)}\n${(r.text || "").substring(0, 150)}`)
        .join("\n---\n");

      setAiProgress(`Analyzing ${trimmed.length} of ${parseResult.reviews.length} reviews...`);

      const res = await fetch("/api/claude/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewBlock,
          reviewCount: trimmed.length,
          brandName: "Dr. Cuddles", // TODO: from project
          productName: "ReadyRESCUE",
        }),
      });

      if (!res.ok) {
        let msg = `API returned ${res.status}`;
        try { const err = await res.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      setAnalyzedReviews(data.reviews);
      if (data.usage) setAiUsage(data.usage);
      setAiProgress("");
      setStep("review");
    } catch (err: any) {
      setAiError(err.message || "Failed to analyze reviews");
      setAiProgress("");
    } finally {
      setIsRunningAI(false);
    }
  }, [parseResult]);

  // Filtered reviews
  const filteredReviews = analyzedReviews.filter((r) => {
    if (starFilter !== "all" && r.ReviewStarRating !== parseInt(starFilter)) return false;
    if (sentimentFilter !== "all" && r.ReviewSentiment !== sentimentFilter) return false;
    if (searchFilter) {
      const s = searchFilter.toLowerCase();
      const origText = (originalTextMap.get(r.ReviewID) || "").toLowerCase();
      if (!r.ReviewTitle.toLowerCase().includes(s) && !r.ReviewKeyThemes.toLowerCase().includes(s) && !r.ReviewRufusUsableInsight.toLowerCase().includes(s) && !origText.includes(s)) return false;
    }
    return true;
  });

  // Download OUT_REV CSV
  const downloadCSV = useCallback(() => {
    const headers = [
      "ReviewID", "ReviewDate", "ReviewReviewerName", "ReviewASIN", "ReviewProductVariation",
      "ReviewStarRating", "ReviewTitle", "ReviewText", "ReviewSentiment", "ReviewKeyThemes",
      "ReviewUsageMentioned", "ReviewPackagingFeedback", "ReviewPriceFeedback",
      "ReviewHeatLevelFeedback", "ReviewRufusUsableInsight", "ReviewBulletMapping",
    ];
    // Merge original text back in
    const originalMap = new Map(parseResult?.reviews.map((r) => [r.review_id, r.text]) || []);

    const rows = analyzedReviews.map((r) => {
      const values = [
        r.ReviewID, r.ReviewDate, r.ReviewReviewerName, r.ReviewASIN, r.ReviewProductVariation,
        String(r.ReviewStarRating), r.ReviewTitle, originalMap.get(r.ReviewID) || "",
        r.ReviewSentiment, r.ReviewKeyThemes, r.ReviewUsageMentioned,
        r.ReviewPackagingFeedback, r.ReviewPriceFeedback, r.ReviewHeatLevelFeedback,
        r.ReviewRufusUsableInsight, r.ReviewBulletMapping,
      ];
      return values.map((v) => {
        const s = String(v || "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "OUT_REV.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [analyzedReviews, parseResult]);

  // Map review IDs to original text for display
  const originalTextMap = new Map(parseResult?.reviews.map((r) => [r.review_id, r.text]) || []);

  // Sentiment counts
  const sentimentCounts: Record<string, number> = {};
  analyzedReviews.forEach((r) => {
    sentimentCounts[r.ReviewSentiment] = (sentimentCounts[r.ReviewSentiment] || 0) + 1;
  });

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold tracking-tight text-zinc-100 mb-1">Review Synthesis</h1>
      <p className="text-xs text-zinc-500 mb-4">
        {step === "upload" ? "Upload Review CSV" : step === "parsed" ? "Parsed Reviews" : step === "review" ? "Review Analysis (OUT_REV)" : "Reviews Approved"}
      </p>
      <StepNav
        steps={REVIEWS_STEPS}
        currentStep={step}
        onStepClick={(key) => setStep(key as ReviewsStep)}
        completedSteps={completedSteps}
        isApproved={isApproved}
      />

      {/* ── Upload ── */}
      {step === "upload" && (
        <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
          <p className="mb-4 text-sm text-zinc-400">
            Upload the Amazon review CSV export for your{" "}
            <strong className="text-zinc-200">parent ASIN</strong>.{" "}
            {parentAsin ? (
              <a
                href={parentAsin.amazon_url || `https://www.amazon.com/dp/${parentAsin.asin}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-brand-400 hover:text-brand-300 underline underline-offset-2"
              >
                {parentAsin.asin}
                <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              </a>
            ) : (
              <span className="text-zinc-500 italic">complete S1 first</span>
            )}{" "}
            — one file covers all variations.
          </p>

          {/* Show uploaded/saved file indicator */}
          {reviewFileName && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-accent-green/30 bg-accent-green/5 px-4 py-2.5">
              <svg className="size-4 text-accent-green shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              <span className="text-xs font-medium text-zinc-300 flex-1">{reviewFileName}</span>
              {parseResult && <span className="text-[10px] text-zinc-500">{parseResult.reviews.length} reviews parsed</span>}
              {!parseResult && analyzedReviews.length > 0 && <span className="text-[10px] text-zinc-500">{analyzedReviews.length} reviews in DB</span>}
              <button
                onClick={() => { setParseResult(null); setReviewFileName(""); setAnalyzedReviews([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="rounded p-1 text-zinc-600 hover:bg-red-950/30 hover:text-accent-red transition-colors"
                title="Remove and re-upload"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleUpload}
            className="w-full rounded-lg border border-dashed border-surface-5 bg-surface-0 px-4 py-3 text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-brand-500/20 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-400 hover:border-brand-700 cursor-pointer"
          />
          <p className="mt-2 text-[10px] text-zinc-600">
            {reviewFileName ? "Upload a new CSV to replace existing data." : "Required columns: id, text, date, title, rating. Optional: profileName, images, helpful, variant:* name"}
          </p>

          {/* Skip if no reviews */}
          {!reviewFileName && (
            <button
              onClick={async () => {
                try {
                  await fetch(`/api/projects/${projectId}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "s3_reviews", data: { reviews: [] } }),
                  });
                } catch {}
                setAnalyzedReviews([]);
                setIsApproved(true);
                setCompletedSteps(new Set(REVIEWS_STEPS.map((s) => s.key)));
                setStep("approved");
              }}
              className="mt-3 rounded-lg border border-surface-4 px-4 py-2 text-xs text-zinc-500 hover:bg-surface-2 hover:text-zinc-300"
            >
              Skip — No Reviews Available
            </button>
          )}
        </div>
      )}

      {/* ── Parsed ── */}
      {step === "parsed" && parseResult && (
        <div>
          {/* Stats */}
          <div className="mb-4 grid grid-cols-4 gap-3">
            <StatCard label="Reviews Parsed" value={parseResult.reviews.length} />
            <StatCard label="With Helpful Votes" value={parseResult.reviews.filter((r) => r.helpful_votes > 0).length} color="amber" />
            <StatCard label="Variant Columns" value={parseResult.variantColumns.length} />
            <StatCard label="Unique Variations" value={new Set(parseResult.reviews.map((r) => r.product_variation)).size} />
          </div>

          {parseResult.errors.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 p-4">
              {parseResult.errors.map((e, i) => (
                <div key={i} className="text-xs text-accent-red py-0.5">{e}</div>
              ))}
            </div>
          )}

          {/* Star distribution */}
          <div className="mb-4 rounded-xl border border-surface-4 bg-surface-1 p-5">
            <div className="mb-3 text-xs font-bold text-zinc-400">Star Distribution</div>
            <div className="flex items-end gap-4">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = parseResult.starDistribution[star] || 0;
                const pct = parseResult.reviews.length > 0 ? (count / parseResult.reviews.length) * 100 : 0;
                const isPriority = star === 3 || star === 4;
                return (
                  <div key={star} className="flex-1 text-center">
                    <div className="mb-1 flex justify-center">
                      <div
                        className={`w-full rounded-t transition-all ${isPriority ? "bg-brand-500" : star === 5 ? "bg-accent-green" : "bg-accent-red/60"}`}
                        style={{ height: `${Math.max(4, pct * 1.5)}px` }}
                      />
                    </div>
                    <div className="text-xs font-bold text-zinc-300">{count}</div>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-[10px] text-zinc-400">{star}★</span>
                      {isPriority && <span className="text-[8px] font-bold text-brand-400">PRIORITY</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preview table */}
          <div className="mb-4 rounded-xl border border-surface-4 bg-surface-1 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-4 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">
                Review Preview (first 30)
              </span>
              <span className="text-[10px] text-zinc-600">{parseResult.reviews.length} total</span>
            </div>
            <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-zinc-500 whitespace-nowrap">Date</th>
                    <th className="px-3 py-2 text-center font-bold text-zinc-500 whitespace-nowrap">Rating</th>
                    <th className="px-3 py-2 text-left font-bold text-zinc-500 whitespace-nowrap">Title</th>
                    <th className="px-3 py-2 text-left font-bold text-zinc-500 whitespace-nowrap min-w-[300px]">Text</th>
                    <th className="px-3 py-2 text-left font-bold text-zinc-500 whitespace-nowrap">Variation</th>
                    <th className="px-3 py-2 text-right font-bold text-zinc-500 whitespace-nowrap">Helpful</th>
                    <th className="px-3 py-2 text-center font-bold text-zinc-500 whitespace-nowrap">Images</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.reviews.slice(0, 30).map((r, i) => (
                    <tr key={i} className="border-t border-surface-4 hover:bg-surface-2/50 align-top">
                      <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{r.date_iso}</td>
                      <td className="px-3 py-2 text-center">
                        <StarBadge rating={r.star_rating} />
                      </td>
                      <td className="px-3 py-2 text-zinc-200 font-medium max-w-[200px]">
                        <div className="break-words" style={{whiteSpace:"normal"}}>{r.title}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-400 min-w-[300px] max-w-[400px]">
                        <div className="line-clamp-3 leading-relaxed">{r.text}</div>
                      </td>
                      <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{r.product_variation}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-400">{r.helpful_votes || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {r.images ? (
                          <span className="inline-flex size-4 items-center justify-center rounded bg-accent-blue/20 text-[8px] font-bold text-accent-blue" title={r.images}>✓</span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parseResult.reviews.length > 30 && (
              <div className="px-4 py-2 border-t border-surface-4 text-[10px] text-zinc-600">
                Showing 30 of {parseResult.reviews.length} reviews
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button onClick={() => { setStep("upload"); setParseResult(null); }} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">
              Back
            </button>
            <AIGeneratingButton
              isGenerating={isRunningAI}
              onClick={handleRunAI}
              label="Run AI Analysis (Claude)"
            />
            <button
              onClick={() => {
                // Skip AI — pass reviews through with placeholder analysis
                const skipped = parseResult!.reviews.slice(0, 50).map((r, i) => ({
                  ReviewID: r.review_id,
                  ReviewDate: r.date_iso,
                  ReviewReviewerName: `Reviewer_${String(i + 1).padStart(3, "0")}`,
                  ReviewASIN: "",
                  ReviewProductVariation: r.product_variation || "",
                  ReviewStarRating: r.star_rating,
                  ReviewTitle: r.title,
                  ReviewText: r.text.substring(0, 200),
                  ReviewSentiment: r.star_rating >= 4 ? "Positive" : r.star_rating === 3 ? "Neutral" : "Negative",
                  ReviewKeyThemes: "AI analysis skipped",
                  ReviewUsageMentioned: "Not analyzed",
                  ReviewPackagingFeedback: "Not analyzed",
                  ReviewPriceFeedback: "Not analyzed",
                  ReviewHeatLevelFeedback: "Not analyzed",
                  ReviewRufusUsableInsight: "Not analyzed",
                  ReviewBulletMapping: "Not analyzed",
                }));
                setAnalyzedReviews(skipped);
                setStep("review");
              }}
              disabled={isRunningAI}
              className="rounded-lg border border-surface-4 px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-surface-2 disabled:opacity-50"
            >
              Skip AI → Approve Raw
            </button>
            <AICostTracker
              isRunning={isRunningAI}
              usage={aiUsage}
              startTime={aiStartTime}
              error={aiError}
            />
          </div>

          {aiError && !isRunningAI && (
            <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-accent-red">{aiError}</div>
          )}
        </div>
      )}

      {/* ── Review OUT_REV ── */}
      {step === "review" && analyzedReviews.length > 0 && (
        <div>
          {/* Sentiment overview */}
          <div className="mb-4 grid grid-cols-6 gap-3">
            {["Positive+", "Positive", "Neutral", "Negative", "Negative-"].map((s) => (
              <div key={s} className="rounded-lg border border-surface-4 bg-surface-1 px-3 py-2.5 text-center">
                <div className={`text-lg font-extrabold ${sentimentColor(s)}`}>{sentimentCounts[s] || 0}</div>
                <div className="text-[9px] text-zinc-500">{s}</div>
              </div>
            ))}
            <StatCard label="Total Analyzed" value={analyzedReviews.length} />
          </div>

          {/* Filters */}
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search titles, themes, insights…"
              className="rounded-md border border-surface-4 bg-surface-0 px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-700 focus:border-brand-700 focus:outline-none w-56"
            />
            <select value={starFilter} onChange={(e) => setStarFilter(e.target.value)} className="rounded-md border border-surface-4 bg-surface-0 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none">
              <option value="all">All Stars</option>
              {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s}★</option>)}
            </select>
            <select value={sentimentFilter} onChange={(e) => setSentimentFilter(e.target.value)} className="rounded-md border border-surface-4 bg-surface-0 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none">
              <option value="all">All Sentiments</option>
              {["Positive+", "Positive", "Neutral", "Negative", "Negative-"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="ml-auto text-[10px] text-zinc-600">{filteredReviews.length} of {analyzedReviews.length}</span>
          </div>

          {/* OUT_REV cards */}
          <div className="mb-4 space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredReviews.map((r) => (
              <div
                key={r.ReviewID}
                className="rounded-lg border border-surface-4 bg-surface-1 p-4 cursor-pointer hover:border-surface-5 transition-colors"
                onClick={() => setExpandedRow(expandedRow === r.ReviewID ? null : r.ReviewID)}
              >
                <div className="flex items-start gap-3">
                  <StarBadge rating={r.ReviewStarRating} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-zinc-200 break-words" style={{whiteSpace:"normal"}}>{r.ReviewTitle}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sentimentBg(r.ReviewSentiment)}`}>
                        {r.ReviewSentiment}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                      <span>{r.ReviewReviewerName}</span>
                      <span>{r.ReviewDate}</span>
                      <span>{r.ReviewProductVariation}</span>
                    </div>

                    {/* Review text preview */}
                    {(() => {
                      const originalText = originalTextMap.get(r.ReviewID) || "";
                      if (!originalText) return null;
                      const isExpanded = expandedRow === r.ReviewID;
                      return (
                        <div className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                          {isExpanded ? originalText : originalText.length > 180 ? originalText.substring(0, 180) + "…" : originalText}
                        </div>
                      );
                    })()}

                    {/* Themes */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.ReviewKeyThemes.split(",").map((t, i) => (
                        <span key={i} className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                          {t.trim()}
                        </span>
                      ))}
                    </div>

                    {/* Expanded detail */}
                    {expandedRow === r.ReviewID && (
                      <div className="mt-3 space-y-2 border-t border-surface-4 pt-3">
                        <DetailRow label="Rufus Insight" value={r.ReviewRufusUsableInsight} />
                        <DetailRow label="Bullet Mapping" value={r.ReviewBulletMapping} />
                        <DetailRow label="Usage" value={r.ReviewUsageMentioned} />
                        <DetailRow label="Packaging" value={r.ReviewPackagingFeedback} />
                        <DetailRow label="Price" value={r.ReviewPriceFeedback} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button onClick={() => setStep("parsed")} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">
              Back
            </button>
            <button onClick={downloadCSV} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">
              Download OUT_REV.csv
            </button>
            <button
              onClick={async () => {
                try {
                  const reviewsWithText = analyzedReviews.map((r) => ({
                    ...r,
                    originalText: originalTextMap.get(r.ReviewID) || "",
                    helpfulVotes: parseResult?.reviews.find((pr) => pr.review_id === r.ReviewID)?.helpful_votes || 0,
                  }));
                  await fetch(`/api/projects/${projectId}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "s3_reviews", data: { reviews: reviewsWithText } }),
                  });
                } catch {}
                router.push(`/projects/${projectId}/rufus`);
              }}
              className="ml-auto rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S3 — Unlock Rufus (S4)
            </button>
          </div>
        </div>
      )}

      {/* ── Approved ── */}
      {step === "approved" && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-6 text-center">
          <div className="mb-2 text-lg font-extrabold text-accent-green">S3 Reviews — Approved ✓</div>
          <p className="text-sm text-zinc-400 mb-4">{analyzedReviews.length} reviews analyzed with sentiment, themes, and Rufus insights.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={downloadCSV} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">
              Download OUT_REV.csv
            </button>
            <a href={`/projects/${projectId}/rufus`} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-bold text-surface-0 hover:bg-brand-400">
              Continue → S4 Rufus
            </a>
            <button onClick={() => { setIsApproved(false); setStep("review"); }} className="rounded-lg border border-surface-4 px-3 py-2 text-xs text-zinc-500 hover:bg-surface-2 hover:text-zinc-300">
              Unlock for Editing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function StatCard({ label, value, color = "default" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-surface-4 bg-surface-1 px-4 py-3">
      <div className={`text-lg font-extrabold ${color === "red" ? "text-accent-red" : color === "green" ? "text-accent-green" : color === "amber" ? "text-accent-amber" : "text-zinc-100"}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function StarBadge({ rating }: { rating: number }) {
  const colors: Record<number, string> = {
    5: "bg-accent-green/20 text-accent-green",
    4: "bg-accent-green/10 text-accent-green/80",
    3: "bg-brand-500/20 text-brand-400",
    2: "bg-accent-red/15 text-accent-red/80",
    1: "bg-accent-red/20 text-accent-red",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold ${colors[rating] || "bg-surface-4 text-zinc-500"}`}>
      {rating}★
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-[10px] font-bold text-zinc-500">{label}</span>
      <span className="text-[11px] text-zinc-300 leading-relaxed text-justify">{value}</span>
    </div>
  );
}

function sentimentColor(s: string): string {
  if (s.startsWith("Positive")) return "text-accent-green";
  if (s === "Neutral") return "text-zinc-400";
  return "text-accent-red";
}

function sentimentBg(s: string): string {
  if (s === "Positive+") return "bg-accent-green/20 text-accent-green";
  if (s === "Positive") return "bg-accent-green/10 text-accent-green/80";
  if (s === "Neutral") return "bg-zinc-700/30 text-zinc-400";
  if (s === "Negative") return "bg-accent-red/15 text-accent-red/80";
  return "bg-accent-red/20 text-accent-red";
}
