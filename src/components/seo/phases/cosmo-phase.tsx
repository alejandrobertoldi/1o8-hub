/* eslint-disable react-doctor/js-tosorted-immutable */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ClientMark, CoverageRow, ScopePill } from "@/components/seo/target-display";
import { markPhaseApproved, useSectionHeader } from "@/components/seo/project-shell";
import { getProjectState } from "@/components/seo/project-shell";
import { seoExportFilename } from "@/lib/seo/export-filename";
import AIGeneratingButton from "@/components/seo/ai-generating-button";
import { useRouter, useParams } from "next/navigation";

// ── Steps ──────────────────────────────────────────────────
const COSMO_STEPS = [
  { key: "inputs", label: "S5.1 Verify Inputs" },
  { key: "summary", label: "S5.2 Research Summary" },
  { key: "mapping", label: "S5.3 Generate COSMO Map" },
  { key: "review", label: "S5.4 Review COSMO Map" },
  { key: "approved", label: "S5.5 Approved" },
];

const RELATION_TYPES = [
  // Functional/Usage
  "USED_FOR_FUNC", "USED_TO", "CAPABLE_OF",
  // Event/Context
  "USED_FOR_EVE", "USED_ON", "USED_IN_LOC",
  // Product/Concept
  "USED_AS", "IS_A", "xIS_A",
  // Body/Interaction
  "USED_IN_BODY",
  // Complementary
  "USED_WITH",
  // Audience/User
  "USED_FOR_AUD", "USED_BY",
  // Interest/Motivation
  "xINTERESTED_IN", "xWANT",
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
    <div className="rounded-[18px] border border-surface-4 bg-surface-2 px-3 py-2">
      <div className={`text-sm font-extrabold ${color === "green" ? "text-accent-green" : color === "amber" ? "text-brand-400" : color === "red" ? "text-red-400" : "text-foreground"}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
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
  const [verifying, setVerifying] = useState(false);
  const autoVerified = useRef(false);
  const autoResearch = useRef(false);

  const [research, setResearch] = useState<ResearchData | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);

  const [cosmoRows, setCosmoRows] = useState<COSMORow[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [parentAsin, setParentAsin] = useState("");
  const [brandName, setBrandName] = useState("");
  const [client, setClient] = useState<{ code: string; name: string } | null>(null);
  const [listingMeta, setListingMeta] = useState<Record<string, { productId: string; summarizedTitle: string | null }>>({});

  // ── Load saved data on mount ─────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const projRes = await fetch(`/api/seo/projects/${projectId}`);
        if (projRes.ok) {
          const proj = await projRes.json();
          if (proj.brand_name) setBrandName(proj.brand_name);
          if (proj.client_id_code) setClient({ code: proj.client_id_code, name: proj.client_name || proj.brand_name || proj.client_id_code });
        if (proj.brand_guidelines) setGuidelinesText(proj.brand_guidelines);
        }

        const asinRes = await fetch(`/api/seo/projects/${projectId}/load?phase=parent_asin`);
        if (asinRes.ok) {
          const { parent } = await asinRes.json();
          if (parent) setParentAsin(parent.asin);
        }

        const cosmoRes = await fetch(`/api/seo/projects/${projectId}/load?phase=s5_cosmo`);
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
      } catch (err) {
        console.error("[S5 COSMO] Failed to load saved data:", err);
      }
      setLoadingState(false);
    }
    load();
  }, [projectId]);

  // Summarized titles + product ids for the S1 panel (same lookup as S1.0)
  useEffect(() => {
    fetch(`/api/seo/projects/${projectId}/listing-meta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setListingMeta(d?.meta || {}))
      .catch(() => {});
  }, [projectId]);

  // ── Verify all prerequisite inputs ───────────────────────
  const verifyInputs = useCallback(async () => {
    setVerifying(true);
    try {
      const status: InputStatus = {
        s1: false, s2: false, s3: false, s4: false,
        s1Count: 0, s2Count: 0, s3Count: 0, s4Count: 0,
      };

      const [s1Res, s2Res, s3Res, s4Res] = await Promise.all([
        fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`),
        fetch(`/api/seo/projects/${projectId}/load?phase=s2_keywords`),
        fetch(`/api/seo/projects/${projectId}/load?phase=s3_reviews`),
        fetch(`/api/seo/projects/${projectId}/load?phase=s4_rufus`),
      ]);

      if (s1Res.ok) { const s1 = await s1Res.json(); status.s1 = (s1.asins?.length || 0) > 0; status.s1Count = s1.asins?.length || 0; }
      if (s2Res.ok) {
        const s2 = await s2Res.json();
        const s2Count = s2.keywords?.length || 0;
        // Also check localStorage in case keywords haven't been saved to Supabase yet
        let s2FromLocal = false;
        try {
          const localRaw = localStorage.getItem(`seo_project_state_${projectId}`);
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
          const localRaw = localStorage.getItem(`seo_project_state_${projectId}`);
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
    } catch (err: unknown) {
      setAiError("Failed to verify inputs: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setVerifying(false);
    }
  }, [projectId]);

  // S5 unlocked and still on the gate: run the (read-only) prerequisite check
  // automatically once the saved data has loaded — no button press needed.
  useEffect(() => {
    if (loadingState || isApproved || step !== "inputs" || autoVerified.current) return;
    autoVerified.current = true;
    void verifyInputs();
  }, [loadingState, isApproved, step, verifyInputs]);

  // ── Load full research data for summary ──────────────────
  const loadResearch = useCallback(async () => {
    setResearchLoading(true);
    try {
      const [s1Res, s2Res, s3Res, s4Res] = await Promise.all([
        fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`),
        fetch(`/api/seo/projects/${projectId}/load?phase=s2_keywords`),
        fetch(`/api/seo/projects/${projectId}/load?phase=s3_reviews`),
        fetch(`/api/seo/projects/${projectId}/load?phase=s4_rufus`),
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
    } catch (err: unknown) {
      setAiError("Failed to load research: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setResearchLoading(false);
    }
  }, [projectId, brandName, parentAsin]);

  // Prerequisites passed while still on the gate: open the Research Summary
  // automatically (read-only loads) — the prerequisite checks stay visible
  // in a collapsible row at the top of the summary.
  useEffect(() => {
    if (!inputsVerified || step !== "inputs" || isApproved || research || researchLoading || autoResearch.current) return;
    autoResearch.current = true;
    void loadResearch();
  }, [inputsVerified, step, isApproved, research, researchLoading, loadResearch]);

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

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch("/api/seo/claude/cosmo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
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
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "COSMO generation timed out. Please try again."
          : "Network error during COSMO generation. Check your connection and try again.");
      } finally { clearTimeout(timer); }

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
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : String(err));
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
    a.href = url; a.download = seoExportFilename(getProjectState(projectId).name, "COSMO_Map"); a.click();
    URL.revokeObjectURL(url);
  }, [cosmoRows]);

  // ── Helpers ──────────────────────────────────────────────

  useSectionHeader({
    title: "COSMO Semantic Modeling",
    subtitle: step === "inputs" ? "Verify Prerequisite Inputs" : step === "summary" ? "Research Summary — All Inputs" : step === "mapping" ? "Generating COSMO Map" : step === "review" ? "Review COSMO Map" : "COSMO — Approved",
    steps: COSMO_STEPS,
    currentStep: step,
    onStepClick: (key) => setStep(key as Step),
    completedSteps,
    isApproved,
  });

  if (loadingState) {
    return <div className="flex items-center justify-center py-20"><span className="text-muted-foreground">Loading S5 COSMO…</span></div>;
  }

  return (
    <div className="w-full min-w-0">
      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 1: VERIFY INPUTS                                  */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "inputs" && (
        <div className="space-y-4">
          <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <h2 className="text-sm font-bold text-foreground mb-3">Prerequisite Gate — All sections must be approved</h2>
            <p className="text-xs text-muted-foreground mb-4">COSMO modeling requires locked data from S1 Intake, S2 Keywords, S3 Reviews, and S4 Alexa for Shopping.</p>

            {verifying && !inputStatus.s1 ? (
              <p className="text-xs text-muted-foreground">Checking inputs…</p>
            ) : !inputStatus.s1 && !inputsVerified && !autoVerified.current ? (
              <button onClick={verifyInputs} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">
                Verify All Inputs
              </button>
            ) : (
              <div className="space-y-2">
                {[
                  { label: "S1 Intake", ok: inputStatus.s1, count: inputStatus.s1Count, unit: "ASINs" },
                  { label: "S2 Keywords", ok: inputStatus.s2, count: inputStatus.s2Count, unit: "keywords" },
                  { label: "S3 Reviews", ok: inputStatus.s3, count: inputStatus.s3Count, unit: "reviews" },
                  { label: "S4 Alexa for Shopping", ok: inputStatus.s4, count: inputStatus.s4Count, unit: "Q&A pairs" },
                ].map(({ label, ok, count, unit }) => (
                  <div key={label} className={`flex items-center gap-3 rounded-[18px] px-4 py-2.5 text-sm ${ok ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                    <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                    <span className={ok ? "text-emerald-300" : "text-red-300"}>{label}</span>
                    <span className="text-muted-foreground text-xs ml-auto">{ok ? (count > 0 ? `${count} ${unit}` : "Skipped") : "Not found"}</span>
                  </div>
                ))}

                {inputsVerified && (
                  <div className="pt-3">
                    <button onClick={loadResearch} disabled={researchLoading} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover disabled:opacity-50">
                      {researchLoading ? "Loading research data…" : "All Verified → View Research Summary"}
                    </button>
                  </div>
                )}
                {!inputsVerified && (
                  <p className="text-xs text-red-400 pt-2">
                    Missing prerequisites. Complete and approve all prior sections before COSMO.{" "}
                    <button type="button" onClick={verifyInputs} disabled={verifying} className="underline hover:text-red-300 disabled:opacity-50">
                      {verifying ? "Checking…" : "Re-check"}
                    </button>
                  </p>
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
          <div className="rounded-[18px] border border-brand-500/20 bg-brand-500/5 px-4 py-3">
            <p className="text-xs text-brand-400">This is the complete research intelligence from S1–S4 that will feed COSMO semantic modeling. Review before proceeding.</p>
          </div>

          {/* Prerequisites — checked automatically; expanded by default, collapsible */}
          <details className="group rounded-full open:rounded-[18px] border border-surface-4 bg-surface-1 px-5 py-3" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-foreground">
              <span className="inline-block text-muted-foreground transition-transform group-open:rotate-90">›</span>
              Prerequisites
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${inputsVerified ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                {[inputStatus.s1, inputStatus.s2, inputStatus.s3, inputStatus.s4].filter(Boolean).length}/4 verified
              </span>
              <button type="button" onClick={(e) => { e.preventDefault(); void verifyInputs(); }} disabled={verifying} className="ml-auto text-[11px] font-normal text-muted-foreground underline hover:text-foreground disabled:opacity-50">
                {verifying ? "Checking…" : "Re-check"}
              </button>
            </summary>
            <div className="mt-3 space-y-2">
              {[
                { label: "S1 Intake", ok: inputStatus.s1, count: inputStatus.s1Count, unit: "ASINs" },
                { label: "S2 Keywords", ok: inputStatus.s2, count: inputStatus.s2Count, unit: "keywords" },
                { label: "S3 Reviews", ok: inputStatus.s3, count: inputStatus.s3Count, unit: "reviews" },
                { label: "S4 Alexa for Shopping", ok: inputStatus.s4, count: inputStatus.s4Count, unit: "Q&A pairs" },
              ].map(({ label, ok, count, unit }) => (
                <div key={label} className={`flex items-center gap-3 rounded-full px-4 py-2 text-sm ${ok ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                  <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
                  <span className={ok ? "text-emerald-300" : "text-red-300"}>{label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{ok ? (count > 0 ? `${count} ${unit}` : "Skipped") : "Not found"}</span>
                </div>
              ))}
            </div>
          </details>

          {/* ── S1: Product Identity ── */}
          <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <a href="#s1" className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/20 text-blue-400">S1</span>
              <h2 className="text-sm font-bold text-foreground group-hover:text-blue-400 transition-colors">Product Identity & Structure</h2>
              <span className="ml-auto text-[10px] text-muted-foreground/60 group-hover:text-blue-400">Intake →</span>
            </a>
            {/* Client + competitors — same cards as S1.0 */}
            <div className="grid grid-cols-1 gap-3 mb-3 md:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-[18px] border border-surface-4 bg-surface-2 p-4">
                <div className="min-w-0">
                  <h3 className="text-xs text-muted-foreground uppercase mb-2">Client</h3>
                  <p className="text-sm font-medium truncate">{client?.name || research.brandName}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{client?.code || "—"}</p>
                </div>
                {client && <ClientMark compact client={{ clientIdCode: client.code, clientName: client.name }} />}
              </div>
              <div className="rounded-[18px] border border-surface-4 bg-surface-2 p-4">
                <h3 className="text-xs text-muted-foreground uppercase mb-2">Competitors</h3>
                {research.competitors.length > 0 ? (
                  <div className="text-sm text-foreground/80 space-y-0.5">
                    {research.competitors.map((c, i) => (
                      <p key={i} className="truncate" title={c.url || undefined}>{i + 1}. {c.name}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">None</p>
                )}
              </div>
            </div>

            {/* Targeted ASINs — same A+-style panel as S1.0 */}
            <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-muted-foreground uppercase">Targeted ASINs</h3>
                <span className="text-xs text-muted-foreground">{research.asins.length} ASIN{research.asins.length === 1 ? "" : "s"}{research.variationTheme ? ` · ${research.variationTheme}` : ""}</span>
              </div>
              <div className="space-y-3">
                {Object.values(
                  research.asins.reduce((acc: Record<string, any[]>, a: any) => {
                    const k = a.variation_id || a.asin;
                    (acc[k] ||= []).push(a);
                    return acc;
                  }, {})
                ).map((group: any[]) => {
                  const parent = group.find((a) => (a.parentage_level || "").toLowerCase() === "parent");
                  const kids = group.filter((a) => a !== parent);
                  const head = parent || kids[0];
                  const meta = (a: any) => listingMeta[`${a.asin}::${a.sku ?? ""}`] ?? listingMeta[a.asin];
                  const title = (a: any) => meta(a)?.summarizedTitle || a.existing_content?.item_name || null;
                  return (
                    <div key={head?.variation_id || head?.asin} className="rounded-[18px] border border-border bg-muted/20 p-3">
                      <div className="mb-2 flex min-w-0 items-center gap-2">
                        <ScopePill scope={parent ? "VARIATION" : "ASIN"} />
                        <span className="truncate text-sm text-foreground">{[head?.variation_id, head?.variation_product].filter(Boolean).join(" ") || head?.asin}</span>
                      </div>
                      {parent && <CoverageRow badge="Parent" asin={parent.asin} productId={meta(parent)?.productId} from="seo-project" title={title(parent)} />}
                      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                        {kids.map((a) => (
                          <CoverageRow
                            key={`${a.asin}::${a.sku}`}
                            badge={(a.parentage_level || "").toLowerCase() === "child" ? "Child" : "Standalone"}
                            asin={a.asin}
                            productId={meta(a)?.productId}
                            from="seo-project"
                            title={title(a)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Variety packs — included items */}
            {(research.varietyPackDetails || []).some((v: any) => v.includedRows?.length > 0) && (
              <div className="rounded-[18px] border border-amber-500/15 bg-amber-500/5 p-3 mb-3 space-y-2">
                <p className="text-[9px] font-bold text-amber-400/70 uppercase tracking-wide">Variety pack — included items</p>
                {(research.varietyPackDetails || []).filter((v: any) => v.includedRows?.length > 0).map((vp: any) => (
                  <div key={vp.asin} className="space-y-1">
                    <p className="font-mono text-[10px] text-amber-300/80">{vp.asin}</p>
                    {vp.includedRows.map((row: any, ri: number) => (
                      <div key={ri} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-amber-300/80">
                        <span className="text-amber-400/50 font-mono">#{ri + 1}</span>
                        {[row.flavor, row.size, row.color, row.style].filter(Boolean).map((v: string) => (
                          <span key={v} className="bg-amber-500/10 px-1.5 py-0.5 rounded-full">{v}</span>
                        ))}
                        {row.units && row.units !== "1" && <span className="text-amber-400/50">x{row.units}</span>}
                        {row.customLabel && <span className="italic text-amber-400/50">{row.customLabel}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Brand Guidelines */}
            {guidelinesText && (
              <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/5 p-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Brand Guidelines — Locked</h3>
                  <span className="text-[10px] text-muted-foreground">{guidelinesText.length.toLocaleString()} chars</span>
                </div>
                <p className="text-[11px] text-foreground/80 whitespace-pre-wrap leading-relaxed line-clamp-6">{guidelinesText}</p>
                {guidelinesText.length > 400 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Showing preview — full guidelines applied to all AI generation</p>
                )}
              </div>
            )}
            {!guidelinesText && (
              <div className="rounded-[18px] border border-border bg-card/80 p-3 mt-3">
                <p className="text-[11px] text-muted-foreground">No brand guidelines provided — S1.6 was skipped</p>
              </div>
            )}
          </div>

          {/* ── S2: Keyword Intelligence ── */}
          <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <a href="#s2" className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-500/20 text-green-400">S2</span>
              <h2 className="text-sm font-bold text-foreground group-hover:text-green-400 transition-colors">Keyword Intelligence</h2>
              <span className="ml-auto text-[10px] text-muted-foreground/60 group-hover:text-green-400">Keywords →</span>
            </a>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <StatBadge label="Total Keywords" value={research.keywords.length} color="amber" />
              {Object.entries(research.tierCounts).sort().map(([tier, count]) => (
                <StatBadge key={tier} label={tier} value={count} color={tier === "Tier 1" ? "green" : tier === "Tier 2" ? "amber" : "zinc"} />
              ))}
            </div>

            {/* Top Tier 1 */}
            <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3 mb-3">
              <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Top Tier 1 Keywords (Surface Text Targets)</h3>
              <div className="flex flex-wrap gap-1.5">
                {research.topKeywords.map((k: any, i: number) => (
                  <span key={i} className="px-2 py-1 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {k.KeywordText} <span className="text-muted-foreground ml-1">SV:{k.KeywordSearchVolume}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Intent + Buyer Stage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Search Intent</h3>
                {Object.entries(research.intentBreakdown).sort((a, b) => b[1] - a[1]).map(([intent, count]) => (
                  <div key={intent} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="text-foreground/80">{intent}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-surface-4 overflow-hidden">
                        <div className="h-full bg-brand-500/60 rounded-full" style={{width: `${(count / research.keywords.length) * 100}%`}} />
                      </div>
                      <span className="text-muted-foreground w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">COSMO Relationships (from Keywords)</h3>
                {(() => {
                  const cosmoKw: Record<string, number> = {};
                  research.keywords.forEach((k: any) => {
                    if (k.KeywordCOSMORelationship) cosmoKw[k.KeywordCOSMORelationship] = (cosmoKw[k.KeywordCOSMORelationship] || 0) + 1;
                  });
                  return Object.entries(cosmoKw).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([rel, count]) => (
                    <div key={rel} className="flex items-center justify-between text-[11px] py-0.5">
                      <span className="text-foreground/80">{rel}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* ── S3: Review Intelligence ── */}
          <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <a href="#s3" className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-yellow-500/20 text-yellow-400">S3</span>
              <h2 className="text-sm font-bold text-foreground group-hover:text-yellow-400 transition-colors">Review Intelligence</h2>
              <span className="ml-auto text-[10px] text-muted-foreground/60 group-hover:text-yellow-400">Reviews →</span>
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
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Top Themes (Frequency)</h3>
                <div className="space-y-1">
                  {research.topThemes.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground/60 w-4">{i + 1}.</span>
                      <span className="text-foreground/80">{t}</span>
                    </div>
                  ))}
                  {research.topThemes.length === 0 && <span className="text-muted-foreground/60 text-[11px]">No themes extracted</span>}
                </div>
              </div>

              {/* Alexa for Shopping Insights */}
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Alexa for Shopping Insights</h3>
                <div className="space-y-1.5">
                  {research.topInsights.map((ins, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-brand-500/30">{ins}</div>
                  ))}
                  {research.topInsights.length === 0 && <span className="text-muted-foreground/60 text-[11px]">No actionable insights</span>}
                </div>
              </div>
            </div>
          </div>

          {/* ── S4: Alexa for Shopping Intelligence ── */}
          <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <a href="#s4" className="flex items-center gap-2 mb-4 group cursor-pointer">
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500/20 text-red-400">S4</span>
              <h2 className="text-sm font-bold text-foreground group-hover:text-red-400 transition-colors">Alexa for Shopping Intelligence</h2>
              <span className="ml-auto text-[10px] text-muted-foreground/60 group-hover:text-red-400">Alexa for Shopping →</span>
            </a>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatBadge label="Q&A Pairs" value={research.rufusRows.length} color="amber" />
              <StatBadge label="Categories" value={Object.keys(research.rufusCategories).length} />
              <StatBadge label="COSMO Hints" value={Object.keys(research.cosmoHints).length} color="green" />
              <StatBadge label="Actionable" value={research.rufusRows.filter((r: any) => r.RufusInsightType && r.RufusInsightType !== "None" && r.RufusInsightType !== "Not Applicable").length} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {/* Categories */}
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Question Categories</h3>
                {Object.entries(research.rufusCategories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="text-foreground/80">{cat}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                ))}
                {Object.keys(research.rufusCategories).length === 0 && <span className="text-muted-foreground/60 text-[11px]">No categories</span>}
              </div>

              {/* COSMO Hints */}
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3">
                <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">COSMO Relationship Hints</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(research.cosmoHints).sort((a, b) => b[1] - a[1]).map(([rel, count]) => (
                    <span key={rel} className="px-2 py-1 rounded-full text-[10px] bg-brand-500/10 text-brand-400 border border-brand-500/20">
                      {rel} <span className="text-muted-foreground">×{count}</span>
                    </span>
                  ))}
                  {Object.keys(research.cosmoHints).length === 0 && <span className="text-muted-foreground/60 text-[10px]">No hints</span>}
                </div>
              </div>
            </div>

            {/* Key Q&A pairs */}
            <div className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3">
              <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Key Q&A Pairs</h3>
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2" style={{scrollbarWidth:"thin"}}>
                {research.rufusRows.slice(0, 10).map((r: any, i: number) => (
                  <div key={i} className="text-[11px] border-l-2 border-surface-4 pl-3 py-1 hover:border-brand-500/40 transition-colors">
                    <div className="text-foreground/80 font-medium">{r.RufusQuestion}</div>
                    <div className="text-muted-foreground mt-0.5 line-clamp-2">{r.RufusAnswer}</div>
                    <div className="flex gap-2 mt-1">
                      {r.RufusCOSMORelationship && r.RufusCOSMORelationship !== "Not Applicable" && (
                        <span className="px-1 py-0.5 rounded-full text-[8px] bg-brand-500/10 text-brand-400">{r.RufusCOSMORelationship}</span>
                      )}
                      {r.RufusInsightType && r.RufusInsightType !== "None" && r.RufusInsightType !== "Not Applicable" && (
                        <span className="px-1 py-0.5 rounded-full text-[8px] bg-muted text-muted-foreground">{r.RufusInsightType}</span>
                      )}
                      {r.RufusQuestionCategory && (
                        <span className="px-1 py-0.5 rounded-full text-[8px] bg-muted text-muted-foreground/60">{r.RufusQuestionCategory}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Action Bar ── */}
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => setStep("inputs")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">
              Back to Verification
            </button>
            <button onClick={() => { setStep("mapping"); setTimeout(generateCOSMO, 100); }} className="inline-flex h-9 items-center justify-center ml-auto rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">
              Research Reviewed → Generate COSMO Map
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 3: GENERATING                                     */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "mapping" && (
        <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-6 text-center">
          {isGenerating ? (
            <div>
  <AIGeneratingButton isGenerating={true} onClick={()=>{}} label="Generate COSMO Map" />
            </div>
          ) : aiError ? (
            <div>
              <p className="text-sm text-red-400 mb-3">{aiError}</p>
              <button onClick={generateCOSMO} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">
                Retry Generation
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-foreground/80 mb-4">Ready to generate COSMO semantic map.</p>
<AIGeneratingButton isGenerating={false} onClick={generateCOSMO} label="Generate COSMO Map" />
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* STEP 4: REVIEW COSMO MAP                               */}
      {/* ════════════════════════════════════════════════════════ */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground">COSMO Map — {cosmoRows.length} relationships</h2>
              <div className="flex gap-1 flex-wrap">
                {RELATION_TYPES.filter(rt => cosmoRows.some(r => r.COSMORelationType === rt)).map(rt => (
                  <span key={rt} className="px-1.5 py-0.5 rounded-full text-[9px] bg-brand-500/10 text-brand-400">
                    {rt} ({cosmoRows.filter(r => r.COSMORelationType === rt).length})
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-surface-4 text-muted-foreground">
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
                      <td className="p-2 font-mono text-muted-foreground whitespace-nowrap">{r.ASIN?.substring(0, 10)}</td>
                      <td className="p-2 text-foreground min-w-[100px]" style={{wordBreak:"break-word"}}>{r.COSMOEntity}</td>
                      <td className="p-2 whitespace-nowrap"><span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-brand-500/15 text-brand-400">{r.COSMORelationType}</span></td>
                      <td className="p-2 text-foreground/80 min-w-[80px]" style={{wordBreak:"break-word"}}>{r.COSMOTailType}</td>
                      <td className="p-2 text-foreground/80 min-w-[140px] text-justify" style={{wordBreak:"break-word"}}>{r.COSMOMappedValue}</td>
                      <td className="p-2 text-muted-foreground min-w-[160px] text-justify" style={{wordBreak:"break-word"}}>{r.COSMOUsageExplanation}</td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap">{r.COSMOAppliedPDPSection1}</td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap">{r.COSMOAppliedPDPSection2}</td>
                      <td className="p-2 text-muted-foreground min-w-[120px] text-justify" style={{wordBreak:"break-word"}}>{r.COSMONotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => setStep("summary")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">Back to Summary</button>
            <button onClick={downloadCSV} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">Download COSMO Map CSV</button>
            <button
              onClick={async () => {
                try {
                  await fetch(`/api/seo/projects/${projectId}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "s5_cosmo", data: { rows: cosmoRows } }),
                  });
                } catch (err) {
                  console.error("[S5 COSMO] Failed to save approved data:", err);
                }
                markPhaseApproved(projectId, "s5");
                setIsApproved(true);
                setStep("approved");
              }}
              className="inline-flex h-9 items-center justify-center ml-auto rounded-full bg-accent-green px-4 text-[13px] font-bold text-surface-0 hover:bg-accent-green/80"
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
        <div className="rounded-[18px] border border-accent-green/30 bg-accent-green/5 p-6 text-center">
          <div className="mb-2 text-lg font-extrabold text-accent-green">S5 COSMO — Approved ✓</div>
          <p className="text-sm text-muted-foreground mb-4">{cosmoRows.length} semantic relationships mapped across {RELATION_TYPES.filter(rt => cosmoRows.some(r => r.COSMORelationType === rt)).length} types.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={downloadCSV} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Download COSMO Map CSV</button>
            <a href="#s6" className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">Continue → S6 SEO Content</a>
            <button onClick={() => { setIsApproved(false); setStep("review"); }} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground/80">Unlock for Editing</button>
          </div>
        </div>
      )}

      {aiError && step !== "mapping" && (
        <div className="mt-4 rounded-[18px] bg-red-500/10 border border-red-500/30 p-3">
          <p className="text-sm text-red-400">{aiError}</p>
        </div>
      )}
    </div>
  );
}
