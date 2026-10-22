/* eslint-disable react-doctor/js-tosorted-immutable */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback, useEffect } from "react";
import StepNav from "@/components/step-nav";
import AIGeneratingButton from "@/components/ai-generating-button";
import { useRouter, useParams } from "next/navigation";

// ── Steps ──────────────────────────────────────────────────
const COSMO_STEPS = [
  { key: "inputs", label: "S5.1 Verify Inputs" },
  { key: "summary", label: "S5.2 Research Summary" },
  { key: "mapping", label: "S5.3 Generate COSMO Map" },
  { key: "review", label: "S5.4 Review OUT_COS" },
  { key: "approved", label: "S5.5 Approved" },
];

const RELATION_TYPES = [
  "IS_A", "HAS_A", "USED_FOR", "USED_FOR_AUD", "MADE_OF",
  "SOLD_AS", "COMPARED_TO", "INTERESTED_IN", "AVAILABLE_IN",
  "USED_WITH", "USED_BY", "xINTERESTED_IN", "xWANT",
];

interface COSMORow {
  ASIN: string;
  COSMOEntity: string;
  COSMORelationType: string;
  COSMOTailType: string;
  COSMOMappedValue: string;
  COSMOUsageExplanation: string;
  COSMOAppliedPDPSection1: string;
  COSMOAppliedPDPSection2: string;
  COSMONotes: string;
}

interface InputStatus {
  s1: boolean; s2: boolean; s3: boolean; s4: boolean;
  s1Count: number; s2Count: number; s3Count: number; s4Count: number;
}

interface ResearchData {
  brandName: string;
  parentAsin: string;
  asins: any[];
  variationTheme: string;
  varietyPackDetails?: any[];
  competitors: { name: string; url: string }[];
  keywords: any[];
  tierCounts: Record<string, number>;
  topKeywords: any[];
  intentBreakdown: Record<string, number>;
  reviews: any[];
  avgRating: number;
  sentimentBreakdown: Record<string, number>;
  topThemes: string[];
  topInsights: string[];
  rufusRows: any[];
  rufusCategories: Record<string, number>;
  cosmoHints: Record<string, number>;
}

type Step = "inputs" | "summary" | "mapping" | "review" | "approved";

function StatBadge({ label, value, color = "zinc" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-surface-4 bg-surface-2 px-3 py-2">
      <div className={`text-sm font-extrabold ${color === "green" ? "text-accent-green" : color === "amber" ? "text-brand-400" : color === "red" ? "text-red-400" : "text-zinc-100"}`}>{value}</div>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

export default function COSMOPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [step, setStep] = useState<Step>("inputs");
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isApproved, setIsApproved] = useState(false);
  const [loadingState, setLoadingState] = useState(true);
  const [guidelinesText, setGuidelinesText] = useState("");

  const [inputStatus, setInputStatus] = useState<InputStatus>({
    s1: false, s2: false, s3: false, s4: false,
    s1Count: 0, s2Count: 0, s3Count: 0, s4Count: 0,
  });
  const [inputsVerified, setInputsVerified] = useState(false);

  const [research, setResearch] = useState<ResearchData | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);

  const [cosmoRows, setCosmoRows] = useState<COSMORow[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [parentAsin, setParentAsin] = useState("");
  const [brandName, setBrandName] = useState("");

  // ── Load saved data on mount ─────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const projRes = await fetch(`/api/projects/${projectId}`);
        if (projRes.ok) {
          const proj = await projRes.json();
          if (proj.brand_name) setBrandName(proj.brand_name);
        if (proj.brand_guidelines) setGuidelinesText(proj.brand_guidelines);
        }

        const asinRes = await fetch(`/api/projects/${projectId}/load?phase=parent_asin`);
        if (asinRes.ok) {
          const { parent } = await asinRes.json();
          if (parent) setParentAsin(parent.asin);
        }

        const cosmoRes = await fetch(`/api/projects/${projectId}/load?phase=s5_cosmo`);
        if (cosmoRes.ok) {
          const data = await cosmoRes.json();
          if (data.rows && data.rows.length > 0) {
            setCosmoRows(data.rows);
            setIsApproved(true);
            setInputsVerified(true);
            setCompletedSteps(new Set(COSMO_STEPS.map((s: any) => s.key)));
            setStep("approved");
          }
        }
      } catch {}
      setLoadingState(false);
    }
    load();
  }, [projectId]);

  // ── Verify all prerequisite inputs ───────────────────────
  const verifyInputs = useCallback(async () => {
    try {
      const status: InputStatus = {
        s1: false, s2: false, s3: false, s4: false,
        s1Count: 0, s2Count: 0, s3Count: 0, s4Count: 0,
      };

      const [s1Res, s2Res, s3Res, s4Res] = await Promise.all([
        fetch(`/api/projects/${projectId}/load?phase=s1_intake`),
        fetch(`/api/projects/${projectId}/load?phase=s2_keywords`),
        fetch(`/api/projects/${projectId}/load?phase=s3_reviews`),
        fetch(`/api/projects/${projectId}/load?phase=s4_rufus`),
      ]);

      if (s1Res.ok) { const s1 = await s1Res.json(); status.s1 = (s1.asins?.length || 0) > 0; status.s1Count = s1.asins?.length || 0; }
      if (s2Res.ok) {
        const s2 = await s2Res.json();
        const s2Count = s2.keywords?.length || 0;
        // Also check localStorage in case keywords haven't been saved to Supabase yet
        let s2FromLocal = false;
        try {
          const localRaw = localStorage.getItem(`project_state_${projectId}`);
          if (localRaw) {
            const localState = JSON.parse(localRaw);
            if (localState.s2_approved_at) s2FromLocal = true;
            if (!s2Count && localState.section_locks?.s2_keywords_data) {
              const kdata = JSON.parse(localState.section_locks.s2_keywords_data);
              if (kdata.keywords?.length > 0) { status.s2Count = kdata.keywords.length; }
            }
          }
        } catch {}
        status.s2 = s2Count > 0 || s2FromLocal;
        if (s2Count > 0) status.s2Count = s2Count;
      }
      if (s3Res.ok) {
        const s3 = await s3Res.json();
        const s3Count = s3.reviews?.length || 0;
        // S3 can be skipped (0 reviews) — check approval timestamp too
        let s3Approved = false;
        try {
          const localRaw = localStorage.getItem(`project_state_${projectId}`);
          if (localRaw) {
            const localState = JSON.parse(localRaw);
            if (localState.s3_approved_at) s3Approved = true;
          }
        } catch {}
        status.s3 = s3Count > 0 || s3Approved;
        status.s3Count = s3Count;
      }
      if (s4Res.ok) { const s4 = await s4Res.json(); status.s4 = (s4.rows?.length || 0) > 0; status.s4Count = s4.rows?.length || 0; }

      setInputStatus(status);
      if (status.s1 && status.s2 && status.s3 && status.s4) {
        setInputsVerified(true);
      }
    } catch (err: any) {
      setAiError("Failed to verify inputs: " + err.message);
    }
  }, [projectId]);

  // ── Load full research data for summary ──────────────────
  const loadResearch = useCallback(async () => {
    setResearchLoading(true);
    try {
      const [s1Res, s2Res, s3Res, s4Res] = await Promise.all([
        fetch(`/api/projects/${projectId}/load?phase=s1_intake`),
        fetch(`/api/projects/${projectId}/load?phase=s2_keywords`),
        fetch(`/api/projects/${projectId}/load?phase=s3_reviews`),
        fetch(`/api/projects/${projectId}/load?phase=s4_rufus`),
      ]);

      const s1 = s1Res.ok ? await s1Res.json() : {};
      const s2 = s2Res.ok ? await s2Res.json() : {};
      const s3 = s3Res.ok ? await s3Res.json() : {};
      const s4 = s4Res.ok ? await s4Res.json() : {};

      const kws = s2.keywords || [];
      const revs = s3.reviews || [];
      const ruf = s4.rows || [];

      // S2 analysis
      const tierCounts: Record<string, number> = {};
      const intentBreakdown: Record<string, number> = {};
      kws.forEach((k: any) => {
        tierCounts[k.KeywordPriorityTier] = (tierCounts[k.KeywordPriorityTier] || 0) + 1;
        intentBreakdown[k.KeywordSearchIntent] = (intentBreakdown[k.KeywordSearchIntent] || 0) + 1;
      });

      // S3 analysis
      const sentimentBreakdown: Record<string, number> = {};
      let ratingSum = 0;
      const themeMap: Record<string, number> = {};
      revs.forEach((r: any) => {
        sentimentBreakdown[r.ReviewSentiment] = (sentimentBreakdown[r.ReviewSentiment] || 0) + 1;
        ratingSum += (r.ReviewStarRating || 0);
        if (r.ReviewKeyThemes) {
          r.ReviewKeyThemes.split(/[,;|]/).forEach((t: string) => {
            const clean = t.trim();
            if (clean) themeMap[clean] = (themeMap[clean] || 0) + 1;
          });
        }
      });
      const topThemes = Object.entries(themeMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
      const topInsights = revs.filter((r: any) => r.ReviewRufusUsableInsight && r.ReviewRufusUsableInsight !== "None").slice(0, 6).map((r: any) => r.ReviewRufusUsableInsight);

      // S4 analysis
      const rufusCategories: Record<string, number> = {};
      const cosmoHints: Record<string, number> = {};
      ruf.forEach((r: any) => {
        if (r.RufusQuestionCategory) rufusCategories[r.RufusQuestionCategory] = (rufusCategories[r.RufusQuestionCategory] || 0) + 1;
        if (r.RufusCOSMORelationship) cosmoHints[r.RufusCOSMORelationship] = (cosmoHints[r.RufusCOSMORelationship] || 0) + 1;
      });

      const vpDetails = s1.project?.variety_pack_details || [];
      setResearch({
        brandName: s1.project?.brand_name || brandName,
        parentAsin,
        asins: s1.asins || [],
        varietyPackDetails: vpDetails,
        variationTheme: s1.asins?.[0]?.variation_theme_name || "—",
        competitors: s1.project?.competitors || [],
        keywords: kws,
        tierCounts,
        topKeywords: kws.filter((k: any) => k.KeywordPriorityTier === "Tier 1").slice(0, 12),
        intentBreakdown,
        reviews: revs,
        avgRating: revs.length > 0 ? ratingSum / revs.length : 0,
        sentimentBreakdown,
        topThemes,
        topInsights,
        rufusRows: ruf,
        rufusCategories,
        cosmoHints,
      });

      setCompletedSteps(prev => new Set([...prev, "inputs"]));
      setStep("summary");
    } catch (err: any) {
      setAiError("Failed to load research: " + err.message);
    } finally {
      setResearchLoading(false);
    }
  }, [projectId, brandName, parentAsin]);

  // ── Generate COSMO Map via Claude ────────────────────────
  const generateCOSMO = useCallback(async () => {
    if (!research) return;
    setIsGenerating(true);
    setAiError("");

    try {
      // Pre-trim data on client side to minimize payload size
      const asinList = (research.asins || []).map((a: any) => a.asin).join(", ");
      const topKeywords = (research.keywords || [])
        .slice(0, 25)
        .map((k: any) => `${k.KeywordText} (SV:${k.KeywordSearchVolume}, ${k.KeywordPriorityTier})`)
        .join("\n");
      const reviewThemes = (research.reviews || [])
        .slice(0, 15)
        .map((r: any) => `[${r.ReviewStarRating}★] ${r.ReviewKeyThemes || ""} | ${r.ReviewRufusUsableInsight || ""}`)
        .join("\n");
      const rufusInsights = (research.rufusRows || [])
        .slice(0, 15)
        .map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 150)}\nCOSMO hint: ${r.RufusCOSMORelationship || ""}`)
        .join("\n\n");

      const res = await fetch("/api/claude/cosmo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          brandName: research.brandName,
          parentAsin: research.parentAsin,
          asinList,
          topKeywords,
          reviewThemes,
          rufusInsights,
          guidelines: guidelinesText,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Response was cut off — the API may have timed out. Please try again.");
      }
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);

      setCosmoRows(data.rows || []);
      setCompletedSteps(prev => new Set([...prev, "inputs", "summary"]));
      setStep("review");
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [research]);

  // ── Download CSV ─────────────────────────────────────────
  const downloadCSV = useCallback(() => {
    const headers = ["ASIN","COSMOEntity","COSMORelationType","COSMOTailType","COSMOMappedValue","COSMOUsageExplanation","COSMOAppliedPDPSection1","COSMOAppliedPDPSection2","COSMONotes"];
    const csvRows = [headers.join(",")];
    for (const r of cosmoRows) {
      csvRows.push(headers.map(h => `"${(r[h as keyof COSMORow] || "").replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "OUT_COS.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [cosmoRows]);

  // ── Helpers ──────────────────────────────────────────────


  if (loadingState) {
    return <div className="flex items-center justify-center py-20"><span className="text-zinc-500">Loading S5 COSMO…</span></div>;
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold tracking-tight text-zinc-100 mb-1">COSMO Semantic Modeling</h1>
      <p className="text-xs text-zinc-500 mb-4">
        {step === "inputs" ? "Verify Prerequisite Inputs" : step === "summary" ? "Research Summary — All Inputs" : step === "mapping" ? "Generating COSMO Map" : step === "review" ? "Review COSMO Map (OUT_COS)" : "COSMO — Approved"}
      </p>
      <StepNav
        steps={COSMO_STEPS}
        currentStep={step}
        onStepClick={(key) => setStep(key as Step)}
        completedSteps={completedSteps}
        isApproved={isApproved}
      />

      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 1: VERIFY INPUTS                                  */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "inputs" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
            <h2 className="text-sm font-bold text-zinc-200 mb-3">Prerequisite Gate — All sections must be approved</h2>
            <p className="text-xs text-zinc-500 mb-4">COSMO modeling requires locked data from S1 Intake, S2 Keywords, S3 Reviews, and S4 Rufus.</p>

            {!inputStatus.s1 && !inputsVerified ? (
              <button onClick={verifyInputs} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-surface-0 hover:bg-brand-400">
                Verify All Inputs
              </button>
            ) : (
              <div className="space-y-2">
                {[
                  { label: "S1 Intake", ok: inputStatus.s1, count: inputStatus.s1Count, unit: "ASINs" },
                  { label: "S2 Keywords", ok: inputStatus.s2, count: inputStatus.s2Count, unit: "keywords" },
                  { label: "S3 Reviews", ok: inputStatus.s3, count: inputStatus.s3Count, unit: "reviews" },
                  { label: "S4 Rufus", ok: inputStatus.s4, count: inputStatus.s4Count, unit: "Q&A pairs" },
                ].map(({ label, ok, count, unit }) => (
                  <div key={label} className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm ${ok ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                    <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                    <span className={ok ? "text-emerald-300" : "text-red-300"}>{label}</span>
                    <span className="text-zinc-500 text-xs ml-auto">{ok ? (count > 0 ? `${count} ${unit}` : "Skipped") : "Not found"}</span>
                  </div>
                ))}

                {inputsVerified && (
                  <div className="pt-3">
                    <button onClick={loadResearch} disabled={researchLoading} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-surface-0 hover:bg-brand-400 disabled:opacity-50">
                      {researchLoading ? "Loading research data…" : "All Verified → View Research Summary"}
                    </button>
                  </div>
                )}
                {!inputsVerified && (
                  <p className="text-xs text-red-400 pt-2">Missing prerequisites. Complete and approve all prior sections before COSMO.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 2: RESEARCH SUMMARY                               */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "summary" && research && (
        <div className="space-y-5">
          <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3">
            <p className="text-xs text-brand-400">This is the complete research intelligence from S1–S4 that will feed COSMO semantic modeling. Review before proceeding.</p>
          </div>

          {/* ── S1: Product Identity ── */}
          <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
            <a href={`/projects/${projectId}/intake`} className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400">S1</span>
              <h2 className="text-sm font-bold text-zinc-200 group-hover:text-blue-400 transition-colors">Product Identity & Structure</h2>
              <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-blue-400">Intake →</span>
            </a>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBadge label="Brand" value={research.brandName} />
              <StatBadge label="Parent ASIN" value={research.parentAsin || "—"} />
              <StatBadge label="Total ASINs" value={research.asins.length} color="amber" />
              <StatBadge label="Variation Theme" value={research.variationTheme} />
            </div>

            {/* ASIN family tree — parent always first */}
            <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3 mb-3">
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Variation Family</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-surface-4">
                      <th className="py-1.5 px-2 text-left text-[9px] font-bold text-zinc-600 uppercase tracking-wide whitespace-nowrap">Level</th>
                      <th className="py-1.5 px-2 text-left text-[9px] font-bold text-zinc-600 uppercase tracking-wide whitespace-nowrap">ASIN</th>
                      <th className="py-1.5 px-2 text-left text-[9px] font-bold text-zinc-600 uppercase tracking-wide w-full">Title</th>
                      <th className="py-1.5 px-2 text-left text-[9px] font-bold text-zinc-600 uppercase tracking-wide whitespace-nowrap">Attributes</th>
                      <th className="py-1.5 px-2 text-left text-[9px] font-bold text-zinc-600 uppercase tracking-wide whitespace-nowrap">Pack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...research.asins]
                      .sort((a: any, b: any) => {
                        const aP = (a.parentage_level||"").toLowerCase() === "parent";
                        const bP = (b.parentage_level||"").toLowerCase() === "parent";
                        if (aP && !bP) return -1; if (!aP && bP) return 1; return 0;
                      })
                      .flatMap((a: any) => {
                        const isParent = (a.parentage_level||"").toLowerCase() === "parent";
                        const vp = (research.varietyPackDetails||[]).find((v: any) => v.asin === a.asin);
                        const rows = [];
                        rows.push(
                          <tr key={a.asin} className={`border-b border-surface-4/40 align-top ${isParent ? "bg-blue-500/5" : "hover:bg-surface-3/20"}`}>
                            <td className="p-2 whitespace-nowrap">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${isParent ? "bg-blue-500/15 text-blue-400 border border-blue-500/20" : "bg-purple-500/10 text-purple-400 border border-purple-500/15"}`}>
                                {isParent ? "PARENT" : "CHILD"}
                              </span>
                            </td>
                            <td className="p-2 font-mono text-zinc-400 whitespace-nowrap">{a.asin}</td>
                            <td className="p-2 text-zinc-300 min-w-[220px]" style={{wordBreak:"break-word",whiteSpace:"normal"}}>{a.existing_content?.item_name || "—"}</td>
                            <td className="p-2 whitespace-nowrap text-zinc-500">{[a.flavor,a.size,a.color,a.style].filter(Boolean).join(" · ") || "—"}</td>
                            <td className="p-2 whitespace-nowrap">
                              {vp && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">VARIETY</span>}
                            </td>
                          </tr>
                        );
                        if (vp && vp.includedRows?.length > 0) {
                          rows.push(
                            <tr key={`${a.asin}-vp`} className="border-b border-surface-4/40 bg-amber-500/[0.02]">
                              <td colSpan={5} className="px-2 pb-2 pt-0">
                                <div className="ml-6 rounded border border-amber-500/15 bg-amber-500/5 px-2.5 py-2 space-y-1">
                                  <p className="text-[9px] font-bold text-amber-400/70 uppercase tracking-wide mb-1.5">Included items</p>
                                  {vp.includedRows.map((row: any, ri: number) => (
                                    <div key={ri} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-amber-300/80">
                                      <span className="text-amber-400/50 font-mono">#{ri+1}</span>
                                      {row.flavor && <span className="bg-amber-500/10 px-1.5 py-0.5 rounded">{row.flavor}</span>}
                                      {row.size   && <span className="bg-amber-500/10 px-1.5 py-0.5 rounded">{row.size}</span>}
                                      {row.color  && <span className="bg-amber-500/10 px-1.5 py-0.5 rounded">{row.color}</span>}
                                      {row.style  && <span className="bg-amber-500/10 px-1.5 py-0.5 rounded">{row.style}</span>}
                                      {row.units && row.units !== "1" && <span className="text-amber-400/50">x{row.units}</span>}
                                      {row.customLabel && <span className="italic text-amber-400/50">{row.customLabel}</span>}
                                    </div>
                                  ))}
                                  {(vp.extraFlavors||vp.extraSizes||vp.extraColors||vp.extraStyles) && (
                                    <p className="text-[9px] text-amber-400/50 italic pt-0.5">Extra: {[vp.extraFlavors,vp.extraSizes,vp.extraColors,vp.extraStyles].filter(Boolean).join(", ")}</p>
                                  )}
                                  {vp.notes && <p className="text-[9px] text-amber-400/40 italic">{vp.notes}</p>}
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        return rows;
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>

            {/* Competitors */}
            {research.competitors.length > 0 && (
              <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Competitor Context</h3>
                <div className="space-y-1">
                  {research.competitors.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="text-zinc-600">{i+1}.</span>
                      <span className="text-zinc-300">{c.name}</span>
                      {c.url && <span className="text-zinc-600 text-[10px] truncate">{c.url}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Brand Guidelines */}
            {guidelinesText && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Brand Guidelines — Locked</h3>
                  <span className="text-[10px] text-zinc-500">{guidelinesText.length.toLocaleString()} chars</span>
                </div>
                <p className="text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed line-clamp-6">{guidelinesText}</p>
                {guidelinesText.length > 400 && (
                  <p className="text-[10px] text-zinc-500 mt-1">Showing preview — full guidelines applied to all AI generation</p>
                )}
              </div>
            )}
            {!guidelinesText && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 mt-3">
                <p className="text-[11px] text-zinc-500">No brand guidelines provided — S1.6 was skipped</p>
              </div>
            )}
          </div>

          {/* ── S2: Keyword Intelligence ── */}
          <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
            <a href={`/projects/${projectId}/keywords`} className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400">S2</span>
              <h2 className="text-sm font-bold text-zinc-200 group-hover:text-green-400 transition-colors">Keyword Intelligence</h2>
              <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-green-400">OUT_KEY →</span>
            </a>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <StatBadge label="Total Keywords" value={research.keywords.length} color="amber" />
              {Object.entries(research.tierCounts).sort().map(([tier, count]) => (
                <StatBadge key={tier} label={tier} value={count} color={tier === "Tier 1" ? "green" : tier === "Tier 2" ? "amber" : "zinc"} />
              ))}
            </div>

            {/* Top Tier 1 */}
            <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3 mb-3">
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Top Tier 1 Keywords (Surface Text Targets)</h3>
              <div className="flex flex-wrap gap-1.5">
                {research.topKeywords.map((k: any, i: number) => (
                  <span key={i} className="px-2 py-1 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {k.KeywordText} <span className="text-zinc-500 ml-1">SV:{k.KeywordSearchVolume}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Intent + Buyer Stage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Search Intent</h3>
                {Object.entries(research.intentBreakdown).sort((a, b) => b[1] - a[1]).map(([intent, count]) => (
                  <div key={intent} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="text-zinc-300">{intent}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-surface-4 overflow-hidden">
                        <div className="h-full bg-brand-500/60 rounded-full" style={{width: `${(count / research.keywords.length) * 100}%`}} />
                      </div>
                      <span className="text-zinc-500 w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">COSMO Relationships (from Keywords)</h3>
                {(() => {
                  const cosmoKw: Record<string, number> = {};
                  research.keywords.forEach((k: any) => {
                    if (k.KeywordCOSMORelationship) cosmoKw[k.KeywordCOSMORelationship] = (cosmoKw[k.KeywordCOSMORelationship] || 0) + 1;
                  });
                  return Object.entries(cosmoKw).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([rel, count]) => (
                    <div key={rel} className="flex items-center justify-between text-[11px] py-0.5">
                      <span className="text-zinc-300">{rel}</span>
                      <span className="text-zinc-500">{count}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* ── S3: Review Intelligence ── */}
          <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
            <a href={`/projects/${projectId}/reviews`} className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-400">S3</span>
              <h2 className="text-sm font-bold text-zinc-200 group-hover:text-yellow-400 transition-colors">Review Intelligence</h2>
              <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-yellow-400">OUT_REV →</span>
            </a>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBadge label="Total Reviews" value={research.reviews.length} color="amber" />
              <StatBadge label="Avg Rating" value={research.avgRating.toFixed(1) + "★"} color={research.avgRating >= 4 ? "green" : research.avgRating >= 3 ? "amber" : "red"} />
              {Object.entries(research.sentimentBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s, c]) => (
                <StatBadge key={s} label={s} value={c} color={s.toLowerCase().includes("positive") ? "green" : s.toLowerCase().includes("negative") ? "red" : "zinc"} />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Themes */}
              <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Top Themes (Frequency)</h3>
                <div className="space-y-1">
                  {research.topThemes.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="text-zinc-600 w-4">{i + 1}.</span>
                      <span className="text-zinc-300">{t}</span>
                    </div>
                  ))}
                  {research.topThemes.length === 0 && <span className="text-zinc-600 text-[11px]">No themes extracted</span>}
                </div>
              </div>

              {/* Rufus-Usable Insights */}
              <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Rufus-Usable Insights</h3>
                <div className="space-y-1.5">
                  {research.topInsights.map((ins, i) => (
                    <div key={i} className="text-[11px] text-zinc-400 pl-2 border-l-2 border-brand-500/30">{ins}</div>
                  ))}
                  {research.topInsights.length === 0 && <span className="text-zinc-600 text-[11px]">No actionable insights</span>}
                </div>
              </div>
            </div>
          </div>

          {/* ── S4: Rufus Intelligence ── */}
          <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
            <a href={`/projects/${projectId}/rufus`} className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">S4</span>
              <h2 className="text-sm font-bold text-zinc-200 group-hover:text-red-400 transition-colors">Rufus Intelligence</h2>
              <span className="ml-auto text-[10px] text-zinc-600 group-hover:text-red-400">OUT_RUF →</span>
            </a>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBadge label="Q&A Pairs" value={research.rufusRows.length} color="amber" />
              <StatBadge label="Categories" value={Object.keys(research.rufusCategories).length} />
              <StatBadge label="COSMO Hints" value={Object.keys(research.cosmoHints).length} color="green" />
              <StatBadge label="Actionable" value={research.rufusRows.filter((r: any) => r.RufusInsightType && r.RufusInsightType !== "None" && r.RufusInsightType !== "Not Applicable").length} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {/* Categories */}
              <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Question Categories</h3>
                {Object.entries(research.rufusCategories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="text-zinc-300">{cat}</span>
                    <span className="text-zinc-500">{count}</span>
                  </div>
                ))}
                {Object.keys(research.rufusCategories).length === 0 && <span className="text-zinc-600 text-[11px]">No categories</span>}
              </div>

              {/* COSMO Hints */}
              <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">COSMO Relationship Hints</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(research.cosmoHints).sort((a, b) => b[1] - a[1]).map(([rel, count]) => (
                    <span key={rel} className="px-2 py-1 rounded-full text-[10px] bg-brand-500/10 text-brand-400 border border-brand-500/20">
                      {rel} <span className="text-zinc-500">×{count}</span>
                    </span>
                  ))}
                  {Object.keys(research.cosmoHints).length === 0 && <span className="text-zinc-600 text-[10px]">No hints</span>}
                </div>
              </div>
            </div>

            {/* Key Q&A pairs */}
            <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">Key Q&A Pairs</h3>
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2" style={{scrollbarWidth:"thin"}}>
                {research.rufusRows.slice(0, 10).map((r: any, i: number) => (
                  <div key={i} className="text-[11px] border-l-2 border-surface-4 pl-3 py-1 hover:border-brand-500/40 transition-colors">
                    <div className="text-zinc-300 font-medium">{r.RufusQuestion}</div>
                    <div className="text-zinc-500 mt-0.5 line-clamp-2">{r.RufusAnswer}</div>
                    <div className="flex gap-2 mt-1">
                      {r.RufusCOSMORelationship && r.RufusCOSMORelationship !== "Not Applicable" && (
                        <span className="px-1 py-0.5 rounded text-[8px] bg-brand-500/10 text-brand-400">{r.RufusCOSMORelationship}</span>
                      )}
                      {r.RufusInsightType && r.RufusInsightType !== "None" && r.RufusInsightType !== "Not Applicable" && (
                        <span className="px-1 py-0.5 rounded text-[8px] bg-zinc-800 text-zinc-500">{r.RufusInsightType}</span>
                      )}
                      {r.RufusQuestionCategory && (
                        <span className="px-1 py-0.5 rounded text-[8px] bg-zinc-800 text-zinc-600">{r.RufusQuestionCategory}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Action Bar ── */}
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => setStep("inputs")} className="rounded-lg border border-surface-4 px-4 py-2 text-sm text-zinc-400 hover:bg-surface-2">
              Back to Verification
            </button>
            <button onClick={() => { setStep("mapping"); setTimeout(generateCOSMO, 100); }} className="ml-auto rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-brand-400">
              Research Reviewed → Generate COSMO Map
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 3: GENERATING                                     */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "mapping" && (
        <div className="rounded-xl border border-surface-4 bg-surface-1 p-6 text-center">
          {isGenerating ? (
            <div>
  <AIGeneratingButton isGenerating={true} onClick={()=>{}} label="Ask Claude to Generate COSMO Map" />
            </div>
          ) : aiError ? (
            <div>
              <p className="text-sm text-red-400 mb-3">{aiError}</p>
              <button onClick={generateCOSMO} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-surface-0 hover:bg-brand-400">
                Retry Generation
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-zinc-300 mb-4">Ready to generate COSMO semantic map.</p>
<AIGeneratingButton isGenerating={false} onClick={generateCOSMO} label="Ask Claude to Generate COSMO Map" />
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 4: REVIEW OUT_COS                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-4 bg-surface-1 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-zinc-200">OUT_COS — {cosmoRows.length} relationships</h2>
              <div className="flex gap-1 flex-wrap">
                {RELATION_TYPES.filter(rt => cosmoRows.some(r => r.COSMORelationType === rt)).map(rt => (
                  <span key={rt} className="px-1.5 py-0.5 rounded text-[9px] bg-brand-500/10 text-brand-400">
                    {rt} ({cosmoRows.filter(r => r.COSMORelationType === rt).length})
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-surface-4 text-zinc-500">
                    <th className="p-2 text-left font-medium">ASIN</th>
                    <th className="p-2 text-left font-medium">Entity</th>
                    <th className="p-2 text-left font-medium">Relation</th>
                    <th className="p-2 text-left font-medium">Tail</th>
                    <th className="p-2 text-left font-medium">Mapped Value</th>
                    <th className="p-2 text-left font-medium">Usage</th>
                    <th className="p-2 text-left font-medium">PDP 1</th>
                    <th className="p-2 text-left font-medium">PDP 2</th>
                    <th className="p-2 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {cosmoRows.map((r, i) => (
                    <tr key={i} className="border-b border-surface-4/50 hover:bg-surface-2/30 align-top">
                      <td className="p-2 font-mono text-zinc-400 whitespace-nowrap">{r.ASIN?.substring(0, 10)}</td>
                      <td className="p-2 text-zinc-200 min-w-[100px]" style={{wordBreak:"break-word"}}>{r.COSMOEntity}</td>
                      <td className="p-2 whitespace-nowrap"><span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-500/15 text-brand-400">{r.COSMORelationType}</span></td>
                      <td className="p-2 text-zinc-300 min-w-[80px]" style={{wordBreak:"break-word"}}>{r.COSMOTailType}</td>
                      <td className="p-2 text-zinc-300 min-w-[140px] text-justify" style={{wordBreak:"break-word"}}>{r.COSMOMappedValue}</td>
                      <td className="p-2 text-zinc-400 min-w-[160px] text-justify" style={{wordBreak:"break-word"}}>{r.COSMOUsageExplanation}</td>
                      <td className="p-2 text-zinc-400 whitespace-nowrap">{r.COSMOAppliedPDPSection1}</td>
                      <td className="p-2 text-zinc-400 whitespace-nowrap">{r.COSMOAppliedPDPSection2}</td>
                      <td className="p-2 text-zinc-500 min-w-[120px] text-justify" style={{wordBreak:"break-word"}}>{r.COSMONotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => setStep("summary")} className="rounded-lg border border-surface-4 px-4 py-2 text-sm text-zinc-400 hover:bg-surface-2">Back to Summary</button>
            <button onClick={downloadCSV} className="rounded-lg border border-surface-4 px-4 py-2 text-sm text-zinc-400 hover:bg-surface-2">Download OUT_COS.csv</button>
            <button
              onClick={async () => {
                try {
                  await fetch(`/api/projects/${projectId}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "s5_cosmo", data: { rows: cosmoRows } }),
                  });
                } catch {}
                setIsApproved(true);
                setStep("approved");
              }}
              className="ml-auto rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S5 — Unlock S6 SEO Content
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 5: APPROVED                                       */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "approved" && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-6 text-center">
          <div className="mb-2 text-lg font-extrabold text-accent-green">S5 COSMO — Approved ✓</div>
          <p className="text-sm text-zinc-400 mb-4">{cosmoRows.length} semantic relationships mapped across {RELATION_TYPES.filter(rt => cosmoRows.some(r => r.COSMORelationType === rt)).length} types.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={downloadCSV} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">Download OUT_COS.csv</button>
            <a href={`/projects/${projectId}/seo`} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-bold text-surface-0 hover:bg-brand-400">Continue → S6 SEO Content</a>
            <button onClick={() => { setIsApproved(false); setStep("review"); }} className="rounded-lg border border-surface-4 px-3 py-2 text-xs text-zinc-500 hover:bg-surface-2 hover:text-zinc-300">Unlock for Editing</button>
          </div>
        </div>
      )}

      {aiError && step !== "mapping" && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
          <p className="text-sm text-red-400">{aiError}</p>
        </div>
      )}
    </div>
  );
}
