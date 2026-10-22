/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import AIGeneratingButton from "@/components/seo/ai-generating-button";
import Helium10Acquisition from "@/components/seo/helium10-acquisition";
import { helium10Enabled } from "@/lib/helium10/enabled";
import { attachResearchSources, mergeResearchKeywords, type KeywordSnapshot } from "@/lib/helium10/keywords";
import { useParams } from "next/navigation";
import { parseCerebroCSV, type CerebroParseResult } from "@/lib/parsers/cerebro";
import {
  applyCerebroFilters,
  defaultFilterConfig,
  type CerebroFilterConfig,
} from "@/lib/parsers/cerebro-filter";
import AICostTracker from "@/components/seo/ai-cost-tracker";
import {
  approvePhase,
  saveProjectState,
  getProjectState,
} from "@/components/seo/project-shell";
import { useSectionHeader } from "@/components/seo/project-shell";
import { seoExportFilename } from "@/lib/seo/export-filename";

interface TieredKeyword {
  KeywordText: string;
  KeywordSearchVolume: number;
  KeywordPriorityTier: "T1" | "T2" | "T3" | "T4";
  KeywordSearchIntent: string;
  KeywordPrimaryUseLocation: string;
  KeywordMatchType: string;
  KeywordCOSMORelationship: string;
  KeywordBuyerStage: string;
  KeywordNotes: string;
}

interface KeywordAuditEntry {
  KeywordText: string;
  KeywordSearchVolume: number;
  KeywordPriorityTier: "T1" | "T2" | "T3" | "T4";
  isUsed: boolean;
  locations: string[];
}

type KeywordsStep = "upload" | "parsed" | "review" | "approved";

function buildAuditEntries(
  keywords: TieredKeyword[],
  seoContent: Record<string, string>
): KeywordAuditEntry[] {
  return keywords.map((kw) => {
    const phrase = kw.KeywordText.toLowerCase().trim();
    const locations: string[] = [];
    Object.entries(seoContent).forEach(([field, text]) => {
      if (text && text.toLowerCase().includes(phrase)) locations.push(field);
    });
    return {
      KeywordText: kw.KeywordText,
      KeywordSearchVolume: kw.KeywordSearchVolume,
      KeywordPriorityTier: kw.KeywordPriorityTier,
      isUsed: locations.length > 0,
      locations,
    };
  });
}

const SEO_FIELDS: [string, string][] = [
  ["Title", "Title (190–200 chars)"],
  ["Description", "Description"],
  ["Det1", "Detailed Bullet 1"], ["Det2", "Detailed Bullet 2"],
  ["Det3", "Detailed Bullet 3"], ["Det4", "Detailed Bullet 4"],
  ["Det5", "Detailed Bullet 5"],
  ["Con1", "Concise Bullet 1"], ["Con2", "Concise Bullet 2"],
  ["Con3", "Concise Bullet 3"], ["Con4", "Concise Bullet 4"],
  ["Con5", "Concise Bullet 5"],
  ["Ct1", "Content Bullet 1"], ["Ct2", "Content Bullet 2"],
  ["Ct3", "Content Bullet 3"],
  ["Kf1", "Key Feature 1"], ["Kf2", "Key Feature 2"],
  ["Kf3", "Key Feature 3"],
  ["Backend1", "Backend Set 1"], ["Backend2", "Backend Set 2"],
  ["Backend3", "Backend Set 3"], ["Backend4", "Backend Set 4"],
  ["Backend5", "Backend Set 5"],
];

const EMPTY_SEO = Object.fromEntries(SEO_FIELDS.map(([k]) => [k, ""]));

export default function KeywordsPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [step, setStep] = useState<KeywordsStep>("upload");
  const [clientResult, setClientResult] = useState<CerebroParseResult | null>(null);
  const [competitorResults, setCompetitorResults] = useState<CerebroParseResult[]>([]);
  const [competitorName, setCompetitorName] = useState("");
  const [tieredKeywords, setTieredKeywords] = useState<TieredKeyword[]>([]);
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiUsage, setAiUsage] = useState<any>(null);
  const [aiStartTime, setAiStartTime] = useState<number | null>(null);

  const [tierFilter, setTierFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [sortCol, setSortCol] = useState("KeywordSearchVolume");
  const [sortAsc, setSortAsc] = useState(false);

  const [auditLocked, setAuditLocked] = useState(false);
  const [auditEntries, setAuditEntries] = useState<KeywordAuditEntry[]>([]);
  const [seoContent, setSeoContent] = useState<Record<string, string>>(EMPTY_SEO);

  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [asins, setAsins] = useState<{asin:string;sku:string;parentage:string;label:string}[]>([]);
  const [asinCopied, setAsinCopied] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [guidelinesText, setGuidelinesText] = useState("");
  const [filterConfig, setFilterConfig] = useState<CerebroFilterConfig>(defaultFilterConfig);

  const filteredClient = useMemo(() => {
    if (!clientResult) return null;
    return applyCerebroFilters(clientResult.keywords, filterConfig);
  }, [clientResult, filterConfig]);

  const compFileRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const h10 = helium10Enabled();
  const handleClientUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseCerebroCSV(ev.target?.result as string, "Client");
      setClientResult(result);
      setCompletedSteps(prev => new Set([...prev, "upload"]));
      setStep("parsed");
    };
    reader.readAsText(file);
  }, []);

  const handleHeliumResult = useCallback((snapshot: KeywordSnapshot, restored: boolean) => {
    // A saved research snapshot must not replace an already approved keyword view.
    setClientResult(snapshot.client);
    setCompetitorResults(snapshot.competitors);
    if (restored && getProjectState(projectId).s2_approved_at) return;
    setTieredKeywords([]);
    setAuditLocked(false);
    setIsApproved(false);
    setAiError("");
    setCompletedSteps(new Set(["upload"]));
    setStep("parsed");
  }, [projectId]);

  // Restore persisted state on mount
  useEffect(() => {
    if (!projectId) return;
    // Load brand guidelines + ASINs from S1
    fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.project?.brand_guidelines) setGuidelinesText(d.project.brand_guidelines);
        if (d?.asins?.length) {
          setAsins(d.asins.map((a: any) => ({
            asin: a.asin || "",
            sku: a.sku || "",
            parentage: (a.parentage_level || "").toLowerCase(),
            label: a.variation_product || a.asin || "",
          })).filter((a: any) => a.asin));
          // Swap in summarized titles from the Hub products table (read-only lookup)
          fetch(`/api/seo/projects/${projectId}/listing-meta`)
            .then(r => r.ok ? r.json() : null)
            .then((m: { meta?: Record<string, { summarizedTitle: string | null }> } | null) => {
              const meta = m?.meta || {};
              setAsins(prev => prev.map(a => {
                const t = (meta[`${a.asin}::${a.sku}`] ?? meta[a.asin])?.summarizedTitle;
                return t ? { ...a, label: t } : a;
              }));
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    const state = getProjectState(projectId);
    if (state.s2_approved_at) {
      // If we have saved keyword data, restore it
      const raw = state.section_locks?.["s2_keywords_data"];
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved.keywords?.length) setTieredKeywords(saved.keywords);
          if (saved.auditLocked) {
            setAuditLocked(true);
            setAuditEntries(saved.auditEntries || []);
            setSeoContent(saved.seoContent || EMPTY_SEO);
          }
        } catch {}
      }
      setCompletedSteps(new Set(["upload", "parsed", "review", "approved"]));
      setIsApproved(true);
      setStep("approved");
    }
  }, [projectId]);

  const handleCompetitorUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const name = competitorName || file.name.replace(/\.csv$/i, "");
      const result = parseCerebroCSV(ev.target?.result as string, `Competitor: ${name}`);
      setCompetitorResults((prev) => [...prev, result]);
      setCompetitorName("");
      if (compFileRef.current) compFileRef.current.value = "";
    };
    reader.readAsText(file);
  }, [competitorName]);

  const handleRunAI = useCallback(async () => {
    if (!clientResult) return;
    setIsRunningAI(true);
    setAiError("");
    setAiStartTime(Date.now());
    try {
      // Limit: 200 product keywords + 200 competitor keywords (if uploaded)
      // Apply pre-tier filter to client keywords only; competitor keywords pass through unfiltered
      const clientKeywords = filteredClient?.kept ?? clientResult.keywords;
      const productKeywords = clientKeywords.slice(0, 200);
      let remainingCompetitors = 200;
      const competitorBatches = competitorResults.map(result => {
        const keywords = result.keywords.slice(0, remainingCompetitors);
        remainingCompetitors -= keywords.length;
        return { ...result, keywords };
      });
      const allKeywords = mergeResearchKeywords({ ...clientResult, keywords: productKeywords }, competitorBatches);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch("/api/seo/claude/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            keywords: allKeywords,
            brandName: getProjectState(projectId)?.brand_name || "Brand",
            variationProduct: "",
            variationTheme: "",
            competitors: [],
            guidelines: guidelinesText,
          }),
        });
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? `AI tiering timed out — ${allKeywords.length} keywords is a large batch. Please try again.`
          : "Network error during AI tiering. Check your connection and try again.");
      } finally { clearTimeout(timer); }
      if (!res.ok) {
        let msg = `API returned ${res.status}`;
        try { const err = await res.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const researchedKeywords = attachResearchSources(data.keywords as TieredKeyword[], allKeywords);
      setTieredKeywords(researchedKeywords);
      setAiUsage(data.usage);
      setCompletedSteps(prev => new Set([...prev, "upload", "parsed"]));
      setStep("review");
      if (projectId) {
        const state = getProjectState(projectId);
        const locks = { ...(state.section_locks || {}) };
        locks["s2_keywords_data"] = JSON.stringify({ keywords: researchedKeywords });
        saveProjectState(projectId, { section_locks: locks });
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "Failed to run AI tiering");
    } finally {
      setIsRunningAI(false);
    }
  }, [clientResult, competitorResults, projectId, filteredClient, guidelinesText]);

  const handleRunAudit = useCallback(() => {
    setAuditEntries(buildAuditEntries(tieredKeywords, seoContent));
  }, [tieredKeywords, seoContent]);

  const handleLockAudit = useCallback(() => {
    if (!projectId) return;
    const state = getProjectState(projectId);
    const locks = { ...(state.section_locks || {}) };
    const existing = locks["s2_keywords_data"] ? JSON.parse(locks["s2_keywords_data"]) : {};
    locks["s2_keywords_data"] = JSON.stringify({
      ...existing,
      auditLocked: true,
      auditEntries,
      seoContent,
    });
    saveProjectState(projectId, { section_locks: locks });
    setAuditLocked(true);
    window.dispatchEvent(new Event("project_state_updated"));
  }, [projectId, auditEntries, seoContent]);

  const filteredKeywords = tieredKeywords
    .filter((kw) => {
      if (tierFilter !== "all" && kw.KeywordPriorityTier !== tierFilter) return false;
      if (stageFilter !== "all" && kw.KeywordBuyerStage !== stageFilter) return false;
      if (searchFilter && !kw.KeywordText.toLowerCase().includes(searchFilter.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => {
      const av = (a as any)[sortCol], bv = (b as any)[sortCol];
      if (typeof av === "number" && typeof bv === "number")
        return sortAsc ? av - bv : bv - av;
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const tierCounts = { T1: 0, T2: 0, T3: 0, T4: 0 };
  tieredKeywords.forEach((kw) => {
    if (kw.KeywordPriorityTier in tierCounts)
      tierCounts[kw.KeywordPriorityTier as keyof typeof tierCounts]++;
  });

  const downloadCSV = useCallback(() => {
    const hdrs = [
      "KeywordText","KeywordSearchVolume","KeywordPriorityTier","KeywordSearchIntent",
      "KeywordPrimaryUseLocation","KeywordMatchType","KeywordCOSMORelationship",
      "KeywordBuyerStage","KeywordNotes",
    ];
    const rows = tieredKeywords.map((kw) =>
      hdrs.map((h) => {
        const v = String((kw as any)[h] || "");
        return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    );
    const blob = new Blob([[hdrs.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = seoExportFilename(getProjectState(projectId).name, "Keywords"); a.click();
    URL.revokeObjectURL(url);
  }, [tieredKeywords]);

  // Audit split
  const unusedByTier: Record<string, KeywordAuditEntry[]> = { T1: [], T2: [], T3: [], T4: [] };
  const usedEntries: KeywordAuditEntry[] = [];
  auditEntries.forEach((e) => {
    if (e.isUsed) usedEntries.push(e);
    else unusedByTier[e.KeywordPriorityTier]?.push(e);
  });
  (["T1","T2","T3","T4"] as const).forEach((t) => {
    unusedByTier[t].sort((a, b) => b.KeywordSearchVolume - a.KeywordSearchVolume);
  });
  usedEntries.sort((a, b) => b.KeywordSearchVolume - a.KeywordSearchVolume);

  const stepTitle: Record<KeywordsStep, string> = {
    upload: h10 ? "Get Helium 10 Keywords" : "Upload Cerebro CSV",
    parsed: "Parsed Keywords",
    review: "Review Keywords",
    approved: "Keywords Approved ✓",
  };

  const KEYWORDS_STEPS = [
    { key: "upload", label: h10 ? "S2.1 Get Keywords" : "S2.1 Upload CSV" },
    { key: "parsed", label: "S2.2 Parsed Data" },
    { key: "review", label: "S2.3 Review Keywords" },
    { key: "approved", label: "S2.4 Approved" },
  ];

  useSectionHeader({
    title: "Keyword Extraction & Tiering",
    subtitle: stepTitle[step],
    steps: KEYWORDS_STEPS,
    currentStep: step,
    onStepClick: (key) => setStep(key as KeywordsStep),
    completedSteps,
    isApproved,
  });

  return (
    <div className="w-full min-w-0">
      {h10 && <Helium10Acquisition projectId={projectId} onResult={handleHeliumResult} />}
      {/* ── Upload ── */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* ASIN list to copy into Helium 10 */}
          {asins.length > 0 && (
            <div className="rounded-[18px] border border-brand-500/20 bg-brand-500/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-brand-400">{h10 ? "Project ASINs" : "Step 1 — Copy ASINs into Helium 10 Cerebro"}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{h10 ? "These saved S1 ASINs are used for direct Helium 10 research." : "Paste these into Cerebro, run the research, then export as CSV"}</p>
                </div>
                <button
                  onClick={() => {
                    const childAsins = asins.filter(a => a.parentage !== "parent").map(a => a.asin);
                    const toCopy = childAsins.length > 0 ? childAsins : asins.map(a => a.asin);
                    navigator.clipboard.writeText(toCopy.join("\n")).then(() => {
                      setAsinCopied(true);
                      setTimeout(() => setAsinCopied(false), 2000);
                    });
                  }}
                  className={`inline-flex h-9 justify-center items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition-all ${asinCopied ? "bg-accent-green/10 text-accent-green border border-accent-green/20" : "bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30"}`}
                >
                  {asinCopied ? (
                    <><svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Copied!</>
                  ) : (
                    <><svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>Copy variation ASINs</>
                  )}
                </button>
              </div>
              <div className="grid gap-1.5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))"}}>
                {asins.map((a, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded-[18px] border px-3 py-2 ${a.parentage === "parent" ? "border-blue-500/15 bg-blue-500/5" : "border-surface-4 bg-surface-2/50"}`}>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${a.parentage === "parent" ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"}`}>
                      {a.parentage === "parent" ? "Parent" : "Child"}
                    </span>
                    <span className="font-mono text-[11px] text-foreground tracking-wide">{a.asin}</span>
                    {a.label && a.label !== a.asin && (
                      <span className="min-w-0 text-[11px] leading-snug text-muted-foreground">{a.label}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground/60 mt-2">
                {asins.filter(a=>a.parentage!=="parent").length > 0
                  ? `${asins.filter(a=>a.parentage!=="parent").length} child ASINs copied (parent excluded from Cerebro research)`
                  : `${asins.length} ASINs — copy all into Cerebro`}
              </p>
            </div>
          )}

          {/* Product keywords: Helium 10 Cerebro CSV export */}
          {!h10 && (
            <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-5">
              <p className="mb-4 text-sm text-muted-foreground">
                Step 2 — Upload the Helium 10 Cerebro CSV export for your{" "}
                <span className="font-semibold text-foreground">variation ASINs</span>.
              </p>
              <input
                ref={fileInputRef} type="file" accept=".csv" onChange={handleClientUpload} aria-label="Upload Cerebro CSV"
                className="h-9 w-full rounded-full border border-dashed border-surface-5 bg-surface-0 px-4 text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-brand-500/20 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-400 hover:border-brand-700 cursor-pointer"
              />
              <p className="mt-2 text-[10px] text-muted-foreground/60">
                Supported: Keyword Phrase, Search Volume, Cerebro IQ Score, Competing Products, Title Density, CPR, Position
              </p>
            </div>
          )}


        </div>
      )}

      {/* ── Parsed ── */}
      {step === "parsed" && clientResult && (
        <div>
          <div className="mb-4 grid grid-cols-5 gap-3">
            <StatCard label="Product Keywords" value={clientResult.keywords.length} />
            <StatCard label="To AI (max 200)" value={Math.min(clientResult.keywords.length, 200)} color={clientResult.keywords.length > 200 ? "amber" : "green"} />
            <StatCard label="Total Raw Rows" value={clientResult.totalRaw} />
            <StatCard label="Duplicates Removed" value={clientResult.duplicatesRemoved} color="amber" />
            <StatCard label="Invalid Removed" value={clientResult.invalidRemoved} color="red" />
          </div>
          {competitorResults.length > 0 && (() => {
            const compTotal = competitorResults.reduce((s, r) => s + r.keywords.length, 0);
            return (
              <div className="mb-4 grid grid-cols-2 gap-3">
                <StatCard label="Competitor Keywords" value={compTotal} />
                <StatCard label="Competitor To AI (max 200)" value={Math.min(compTotal, 200)} color={compTotal > 200 ? "amber" : "green"} />
              </div>
            );
          })()}
          {clientResult.errors.length > 0 && (
            <div className="mb-4 rounded-[18px] border border-red-900/50 bg-red-950/30 p-4">
              {clientResult.errors.map((e, i) => <div key={i} className="text-xs text-accent-red py-0.5">{e}</div>)}
            </div>
          )}
          <div className="mb-4 rounded-[18px] border border-surface-4 bg-surface-1 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-4 flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">Top Keywords by Search Volume (preview)</span>
              <span className="text-[10px] text-muted-foreground/60">Source: {clientResult.source}</span>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    {["#","Keyword Phrase","Volume","IQ Score","Competition","Title Density","CPR","Position"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientResult.keywords.slice(0, 50).map((kw, i) => (
                    <tr key={i} className="border-t border-surface-4 hover:bg-surface-2/50">
                      <td className="px-3 py-1.5 text-muted-foreground/60">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium text-foreground">{kw.keyword_phrase}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-foreground/80">{kw.search_volume.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{kw.missing_metrics?.includes("cerebro_iq_score") ? "—" : kw.cerebro_iq_score}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{kw.missing_metrics?.includes("competing_products") ? "—" : kw.competing_products.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{kw.missing_metrics?.includes("title_density") ? "—" : kw.title_density}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{kw.missing_metrics?.includes("cpr") ? "—" : kw.cpr}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{kw.position || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Step 2.5 — Pre-Tier Filter */}
          <div className="mb-4 rounded-[18px] border border-border bg-card p-3 space-y-3">
            <div className="text-xs font-bold text-brand-400">
              Step 2.5 — Pre-Tier Filter (optional)
            </div>
            <p className="text-[11px] text-muted-foreground">
              Applied client-side BEFORE tiering. Saves Claude tokens. H10 export recipe
              is in <code>docs/superpowers/specs/2026-05-27-h10-export-recipe.md</code>.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Min search volume</span>
                <input
                  type="number"
                  className="h-9 rounded-full border bg-background px-2"
                  value={filterConfig.minSearchVolume}
                  onChange={(e) =>
                    setFilterConfig((c) => ({ ...c, minSearchVolume: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Max organic rank (0 = off)</span>
                <input
                  type="number"
                  className="h-9 rounded-full border bg-background px-2"
                  value={filterConfig.maxOrganicRank}
                  onChange={(e) =>
                    setFilterConfig((c) => ({ ...c, maxOrganicRank: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Min words (0 = off)</span>
                <input
                  type="number"
                  className="h-9 rounded-full border bg-background px-2"
                  value={filterConfig.minWordCount}
                  onChange={(e) =>
                    setFilterConfig((c) => ({ ...c, minWordCount: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Max words (0 = off)</span>
                <input
                  type="number"
                  className="h-9 rounded-full border bg-background px-2"
                  value={filterConfig.maxWordCount}
                  onChange={(e) =>
                    setFilterConfig((c) => ({ ...c, maxWordCount: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-muted-foreground">Exclude words (comma-separated)</span>
                <input
                  type="text"
                  className="h-9 rounded-full border bg-background px-2"
                  placeholder="e.g. seed, plant, capsule"
                  value={filterConfig.excludeWords.join(", ")}
                  onChange={(e) =>
                    setFilterConfig((c) => ({
                      ...c,
                      excludeWords: e.target.value
                        .split(",")
                        .map((w) => w.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </label>
            </div>
            {filteredClient && (
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">{filteredClient.kept.length}</strong> of{" "}
                {clientResult.keywords.length} keywords pass the filter.
                {filteredClient.dropped.length > 0 && (
                  <span>
                    {" "}Dropped:{" "}
                    {filteredClient.dropped
                      .map((d) => `${d.count} ${d.reason.replace(/_/g, " ")}`)
                      .join(", ")}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 rounded-[18px] border border-amber-900/30 bg-amber-950/10 p-5">
            <div className="mb-2 text-sm font-bold text-accent-amber">Add Competitor Cerebro Data? (Optional)</div>
            <p className="mb-3 text-xs text-muted-foreground">Competitor data reveals keyword gaps and competitive positioning opportunities.</p>
            {competitorResults.length > 0 && (
              <div className="mb-3 space-y-1">
                {competitorResults.map((cr, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-accent-green">
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    {cr.source}: {cr.keywords.length} keywords
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold text-muted-foreground">Competitor Name</label>
                <input value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} placeholder="e.g. BrandX"
                  className="h-9 w-full rounded-full border border-surface-4 bg-surface-0 px-3 text-xs text-foreground/80 placeholder:text-muted-foreground/40 focus:border-brand-700 focus:outline-none" />
              </div>
              <input ref={compFileRef} type="file" accept=".csv" onChange={handleCompetitorUpload}
                className="h-9 rounded-full border border-surface-4 bg-surface-0 px-3 text-xs text-muted-foreground file:mr-2 file:rounded-full file:border-0 file:bg-amber-500/20 file:px-2 file:py-0.5 file:text-[10px] file:font-bold file:text-accent-amber cursor-pointer" />
            </div>
          </div>
          {/* Keyword limits info */}
          {(clientResult.keywords.length > 200 || competitorResults.reduce((sum, r) => sum + r.keywords.length, 0) > 200) && (
            <div className="mb-4 rounded-[18px] border border-blue-900/30 bg-blue-950/10 p-3 text-xs text-blue-400">
              <span className="font-bold">Keyword limits:</span>{" "}
              {clientResult.keywords.length > 200 && (
                <span>Product keywords trimmed from {clientResult.keywords.length} to 200 (top by volume). </span>
              )}
              {competitorResults.reduce((sum, r) => sum + r.keywords.length, 0) > 200 && (
                <span>Competitor keywords trimmed from {competitorResults.reduce((sum, r) => sum + r.keywords.length, 0)} to 200 (top by volume). </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={() => { setStep("upload"); setClientResult(null); setCompetitorResults([]); }}
              className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Back</button>
<AIGeneratingButton
              isGenerating={isRunningAI}
              onClick={handleRunAI}
              label="Run AI Tiering"
              disabled={isRunningAI}
            />
            <AICostTracker isRunning={isRunningAI} usage={aiUsage} startTime={aiStartTime} error={aiError} />
          </div>
          {aiError && !isRunningAI && (
            <div className="mt-3 rounded-[18px] border border-red-900/50 bg-red-950/30 p-3 text-xs text-accent-red">{aiError}</div>
          )}
        </div>
      )}

      {/* ── Review Keywords ── */}
      {step === "review" && tieredKeywords.length > 0 && (
        <div>
          <div className="mb-4 grid grid-cols-5 gap-3">
            <TierCard tier="T1" count={tierCounts.T1} label="Title" color="text-brand-400" min={5} />
            <TierCard tier="T2" count={tierCounts.T2} label="Bullets" color="text-accent-blue" min={10} />
            <TierCard tier="T3" count={tierCounts.T3} label="Description" color="text-accent-green" min={15} />
            <TierCard tier="T4" count={tierCounts.T4} label="Backend" color="text-muted-foreground" min={20} />
            <StatCard label="Total" value={tieredKeywords.length} color={tieredKeywords.length >= 50 ? "green" : "red"} />
          </div>
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Search keywords…"
              className="h-9 rounded-full border border-surface-4 bg-surface-0 px-3 text-xs text-foreground/80 placeholder:text-muted-foreground/40 focus:border-brand-700 focus:outline-none w-52" />
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="h-9 rounded-full border border-surface-4 bg-surface-0 px-2 text-xs text-foreground/80 focus:outline-none">
              <option value="all">All Tiers</option>
              <option value="T1">T1 — Title</option>
              <option value="T2">T2 — Bullets</option>
              <option value="T3">T3 — Description</option>
              <option value="T4">T4 — Backend</option>
            </select>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="h-9 rounded-full border border-surface-4 bg-surface-0 px-2 text-xs text-foreground/80 focus:outline-none">
              <option value="all">All Stages</option>
              <option value="Awareness">Awareness</option>
              <option value="Consideration">Consideration</option>
              <option value="Decision">Decision</option>
            </select>
            <span className="ml-auto text-[10px] text-muted-foreground/60">{filteredKeywords.length} of {tieredKeywords.length}</span>
          </div>
          <div className="mb-4 rounded-[18px] border border-surface-4 bg-surface-1 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr>
                    {["KeywordText","KeywordSearchVolume","KeywordPriorityTier","KeywordSearchIntent","KeywordPrimaryUseLocation","KeywordMatchType","KeywordCOSMORelationship","KeywordBuyerStage","KeywordNotes"].map((col) => (
                      <th key={col} onClick={() => { setSortCol(col); setSortAsc(sortCol === col ? !sortAsc : false); }}
                        className="px-2.5 py-2 text-left font-bold text-muted-foreground cursor-pointer hover:text-foreground/80 whitespace-nowrap select-none">
                        {col.replace("Keyword","").replace(/([A-Z])/g," $1").trim()}
                        {sortCol === col && <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredKeywords.map((kw, i) => (
                    <tr key={i} className="border-t border-surface-4 hover:bg-surface-2/50">
                      <td className="px-2.5 py-1.5 font-medium text-foreground max-w-[200px]">
                        <span className="block text-justify leading-relaxed">{kw.KeywordText}</span>
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-foreground/80">{kw.KeywordSearchVolume?.toLocaleString()}</td>
                      <td className="px-2.5 py-1.5"><TierBadge tier={kw.KeywordPriorityTier} /></td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{kw.KeywordSearchIntent}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{kw.KeywordPrimaryUseLocation}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{kw.KeywordMatchType}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground max-w-[120px] truncate" title={kw.KeywordCOSMORelationship}>{kw.KeywordCOSMORelationship}</td>
                      <td className="px-2.5 py-1.5"><StageBadge stage={kw.KeywordBuyerStage} /></td>
                      <td className="px-2.5 py-1.5 text-muted-foreground max-w-[150px]">
                        <span className="block text-justify leading-relaxed">{kw.KeywordNotes}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setStep("parsed")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Back to Parsed</button>
            <button onClick={handleRunAI} disabled={isRunningAI} className="inline-flex h-9 items-center justify-center rounded-full border border-brand-700 px-4 text-[13px] font-medium text-brand-400 hover:bg-brand-950">Re-run AI Tiering</button>
            <button onClick={downloadCSV} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Download Keywords CSV</button>
            <button
              onClick={() => {
                if (projectId) {
                  approvePhase(projectId, "s2");
                  const state = getProjectState(projectId);
                  const locks = { ...(state.section_locks || {}) };
                  const existing = locks["s2_keywords_data"] ? JSON.parse(locks["s2_keywords_data"]) : {};
                  locks["s2_keywords_data"] = JSON.stringify({ ...existing, approved: true });
                  saveProjectState(projectId, { section_locks: locks });
                  window.dispatchEvent(new Event("project_state_updated"));
                  // Save to Supabase so S5 COSMO can read it
                  fetch(`/api/seo/projects/${projectId}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "s2_keywords", data: { keywords: tieredKeywords } }),
                  }).catch(() => {});
                }
                setCompletedSteps(new Set(["upload", "parsed", "review", "approved"]));
                setIsApproved(true);
                setStep("approved");
              }}
              className="inline-flex h-9 items-center justify-center ml-auto rounded-full bg-accent-green px-4 text-[13px] font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S2 — Unlock Reviews (S3)
            </button>
          </div>
        </div>
      )}



      {/* ── Approved ── */}
      {step === "approved" && (
        <div className="rounded-[18px] border border-accent-green/30 bg-accent-green/5 p-6 text-center">
          <div className="mb-2 text-lg font-extrabold text-accent-green">S2 Keywords — Approved ✓</div>
          <p className="text-sm text-muted-foreground mb-4">{tieredKeywords.length} keywords locked across 4 tiers.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={downloadCSV} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">
              Download Keywords CSV
            </button>
            <button onClick={() => setStep("review")}
              className="inline-flex h-9 items-center justify-center rounded-full border border-brand-700 px-4 text-[13px] font-medium text-brand-400 hover:bg-brand-950">
              View Keywords →
            </button>
            <a href="#s3" className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">
              Continue → S3 Reviews
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = "default", suffix = "" }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <div className="rounded-[18px] border border-surface-4 bg-surface-1 px-4 py-3">
      <div className={`text-lg font-extrabold ${color === "red" ? "text-accent-red" : color === "green" ? "text-accent-green" : color === "amber" ? "text-accent-amber" : "text-foreground"}`}>
        {value}{suffix}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function TierCard({ tier, count, label, color, min }: { tier: string; count: number; label: string; color: string; min: number }) {
  const ok = count >= min;
  return (
    <div className="rounded-[18px] border border-surface-4 bg-surface-1 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className={`text-lg font-extrabold ${color}`}>{count}</span>
        <span className="text-[10px] font-bold text-muted-foreground">{tier}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[9px] font-bold ${ok ? "text-accent-green" : "text-accent-red"}`}>
        {ok ? "✓" : "✗"} min {min}
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    T1: "bg-brand-500/20 text-brand-400",
    T2: "bg-accent-blue/20 text-accent-blue",
    T3: "bg-accent-green/20 text-accent-green",
    T4: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${colors[tier] || "bg-surface-4 text-muted-foreground"}`}>
      {tier}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    Decision: "text-brand-400",
    Consideration: "text-accent-blue",
    Awareness: "text-muted-foreground",
  };
  return <span className={`text-[10px] font-bold ${colors[stage] || "text-muted-foreground"}`}>{stage}</span>;
}
