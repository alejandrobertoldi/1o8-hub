/* eslint-disable react-doctor/no-gray-on-colored-background */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import AIGeneratingButton from "@/components/ai-generating-button";
import { useParams } from "next/navigation";
import { parseCerebroCSV, type CerebroParseResult } from "@/lib/parsers/cerebro";
import AICostTracker from "@/components/ai-cost-tracker";
import {
  approvePhase,
  saveProjectState,
  getProjectState,
} from "@/components/project-shell";
import StepNav from "@/components/step-nav";

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
  const [asins, setAsins] = useState<{asin:string;parentage:string;label:string}[]>([]);
  const [asinCopied, setAsinCopied] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [guidelinesText, setGuidelinesText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compFileRef = useRef<HTMLInputElement>(null);

  // Restore persisted state on mount
  useEffect(() => {
    if (!projectId) return;
    // Load brand guidelines + ASINs from S1
    fetch(`/api/projects/${projectId}/load?phase=s1_intake`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.project?.brand_guidelines) setGuidelinesText(d.project.brand_guidelines);
        if (d?.asins?.length) {
          setAsins(d.asins.map((a: any) => ({
            asin: a.asin || "",
            parentage: (a.parentage_level || "").toLowerCase(),
            label: a.variation_product || a.asin || "",
          })).filter((a: any) => a.asin));
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
      const productKeywords = clientResult.keywords.slice(0, 200);
      const competitorKeywords = competitorResults.flatMap((r) => r.keywords).slice(0, 200);
      const allKeywords = [...productKeywords, ...competitorKeywords];
      const res = await fetch("/api/claude/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: allKeywords,
          brandName: getProjectState(projectId)?.brand_name || "Brand",
          variationProduct: "",
          variationTheme: "",
          competitors: [],
          guidelines: guidelinesText,
        }),
      });
      if (!res.ok) {
        let msg = `API returned ${res.status}`;
        try { const err = await res.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      setTieredKeywords(data.keywords);
      setAiUsage(data.usage);
      setCompletedSteps(prev => new Set([...prev, "upload", "parsed"]));
      setStep("review");
      if (projectId) {
        const state = getProjectState(projectId);
        const locks = { ...(state.section_locks || {}) };
        locks["s2_keywords_data"] = JSON.stringify({ keywords: data.keywords });
        saveProjectState(projectId, { section_locks: locks });
      }
    } catch (err: any) {
      setAiError(err.message || "Failed to run AI tiering");
    } finally {
      setIsRunningAI(false);
    }
  }, [clientResult, competitorResults, projectId]);

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
    a.href = url; a.download = "OUT_KEY.csv"; a.click();
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
    upload: "Upload Cerebro CSV",
    parsed: "Parsed Keywords",
    review: "Review OUT_KEY",
    approved: "Keywords Approved ✓",
  };

  const KEYWORDS_STEPS = [
    { key: "upload", label: "S2.1 Upload CSV" },
    { key: "parsed", label: "S2.2 Parsed Data" },
    { key: "review", label: "S2.3 OUT_KEY Review" },
    { key: "approved", label: "S2.4 Approved" },
  ];

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-extrabold tracking-tight text-zinc-100 mb-1">Keyword Extraction & Tiering</h1>
      <p className="text-xs text-zinc-500 mb-4">{stepTitle[step]}</p>
      <StepNav
        steps={KEYWORDS_STEPS}
        currentStep={step}
        onStepClick={(key) => setStep(key as KeywordsStep)}
        completedSteps={completedSteps}
        isApproved={isApproved}
      />

      {/* ── Upload ── */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* ASIN list to copy into Helium 10 */}
          {asins.length > 0 && (
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-bold text-brand-400">Step 1 — Copy ASINs into Helium 10 Cerebro</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Paste these into Cerebro, run the research, then export as CSV</p>
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
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${asinCopied ? "bg-accent-green/10 text-accent-green border border-accent-green/20" : "bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30"}`}
                >
                  {asinCopied ? (
                    <><svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Copied!</>
                  ) : (
                    <><svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>Copy variation ASINs</>
                  )}
                </button>
              </div>
              <div className="grid gap-1.5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))"}}>
                {asins.map((a, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${a.parentage === "parent" ? "border-blue-500/15 bg-blue-500/5" : "border-surface-4 bg-surface-2/50"}`}>
                    <span className={`shrink-0 px-1 py-0.5 rounded text-[8px] font-bold ${a.parentage === "parent" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/10 text-purple-400"}`}>
                      {a.parentage === "parent" ? "PAR" : "CHD"}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-200 tracking-wide">{a.asin}</span>
                    {a.label && a.label !== a.asin && (
                      <span className="text-[9px] text-zinc-500 truncate">{a.label}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-zinc-600 mt-2">
                {asins.filter(a=>a.parentage!=="parent").length > 0
                  ? `${asins.filter(a=>a.parentage!=="parent").length} child ASINs copied (parent excluded from Cerebro research)`
                  : `${asins.length} ASINs — copy all into Cerebro`}
              </p>
            </div>
          )}

          {/* Upload */}
          <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
            <p className="mb-4 text-sm text-zinc-400">
              Step 2 — Upload the Helium 10 Cerebro CSV export for your{" "}
              <span className="font-semibold text-zinc-200">variation ASINs</span>.
            </p>
            <input
              ref={fileInputRef} type="file" accept=".csv" onChange={handleClientUpload}
              className="w-full rounded-lg border border-dashed border-surface-5 bg-surface-0 px-4 py-3 text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-brand-500/20 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-400 hover:border-brand-700 cursor-pointer"
            />
            <p className="mt-2 text-[10px] text-zinc-600">
              Supported: Keyword Phrase, Search Volume, Cerebro IQ Score, Competing Products, Title Density, CPR, Position
            </p>
          </div>
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
            <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 p-4">
              {clientResult.errors.map((e, i) => <div key={i} className="text-xs text-accent-red py-0.5">{e}</div>)}
            </div>
          )}
          <div className="mb-4 rounded-xl border border-surface-4 bg-surface-1 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-surface-4 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">Top Keywords by Search Volume (preview)</span>
              <span className="text-[10px] text-zinc-600">Source: {clientResult.source}</span>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    {["#","Keyword Phrase","Volume","IQ Score","Competition","Title Density","CPR","Position"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-zinc-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientResult.keywords.slice(0, 50).map((kw, i) => (
                    <tr key={i} className="border-t border-surface-4 hover:bg-surface-2/50">
                      <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium text-zinc-200">{kw.keyword_phrase}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{kw.search_volume.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{kw.cerebro_iq_score}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{kw.competing_products.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{kw.title_density}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{kw.cpr}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{kw.position || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-amber-900/30 bg-amber-950/10 p-5">
            <div className="mb-2 text-sm font-bold text-accent-amber">Add Competitor Cerebro Data? (Optional)</div>
            <p className="mb-3 text-xs text-zinc-400">Competitor data reveals keyword gaps and competitive positioning opportunities.</p>
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
                <label className="mb-1 block text-[10px] font-bold text-zinc-500">Competitor Name</label>
                <input value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} placeholder="e.g. BrandX"
                  className="w-full rounded-md border border-surface-4 bg-surface-0 px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-700 focus:border-brand-700 focus:outline-none" />
              </div>
              <input ref={compFileRef} type="file" accept=".csv" onChange={handleCompetitorUpload}
                className="rounded-md border border-surface-4 bg-surface-0 px-3 py-2 text-xs text-zinc-400 file:mr-2 file:rounded file:border-0 file:bg-amber-500/20 file:px-2 file:py-0.5 file:text-[10px] file:font-bold file:text-accent-amber cursor-pointer" />
            </div>
          </div>
          {/* Keyword limits info */}
          {(clientResult.keywords.length > 200 || competitorResults.reduce((sum, r) => sum + r.keywords.length, 0) > 200) && (
            <div className="mb-4 rounded-lg border border-blue-900/30 bg-blue-950/10 p-3 text-xs text-blue-400">
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
              className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">Back</button>
<AIGeneratingButton
              isGenerating={isRunningAI}
              onClick={handleRunAI}
              label="Ask Claude to Run AI Tiering"
              disabled={isRunningAI}
            />
            <AICostTracker isRunning={isRunningAI} usage={aiUsage} startTime={aiStartTime} error={aiError} />
          </div>
          {aiError && !isRunningAI && (
            <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-accent-red">{aiError}</div>
          )}
        </div>
      )}

      {/* ── Review OUT_KEY ── */}
      {step === "review" && tieredKeywords.length > 0 && (
        <div>
          <div className="mb-4 grid grid-cols-5 gap-3">
            <TierCard tier="T1" count={tierCounts.T1} label="Title" color="text-brand-400" min={5} />
            <TierCard tier="T2" count={tierCounts.T2} label="Bullets" color="text-accent-blue" min={10} />
            <TierCard tier="T3" count={tierCounts.T3} label="Description" color="text-accent-green" min={15} />
            <TierCard tier="T4" count={tierCounts.T4} label="Backend" color="text-zinc-400" min={20} />
            <StatCard label="Total" value={tieredKeywords.length} color={tieredKeywords.length >= 50 ? "green" : "red"} />
          </div>
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Search keywords…"
              className="rounded-md border border-surface-4 bg-surface-0 px-3 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-700 focus:border-brand-700 focus:outline-none w-52" />
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="rounded-md border border-surface-4 bg-surface-0 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none">
              <option value="all">All Tiers</option>
              <option value="T1">T1 — Title</option>
              <option value="T2">T2 — Bullets</option>
              <option value="T3">T3 — Description</option>
              <option value="T4">T4 — Backend</option>
            </select>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-md border border-surface-4 bg-surface-0 px-2 py-1.5 text-xs text-zinc-300 focus:outline-none">
              <option value="all">All Stages</option>
              <option value="Awareness">Awareness</option>
              <option value="Consideration">Consideration</option>
              <option value="Decision">Decision</option>
            </select>
            <span className="ml-auto text-[10px] text-zinc-600">{filteredKeywords.length} of {tieredKeywords.length}</span>
          </div>
          <div className="mb-4 rounded-xl border border-surface-4 bg-surface-1 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr>
                    {["KeywordText","KeywordSearchVolume","KeywordPriorityTier","KeywordSearchIntent","KeywordPrimaryUseLocation","KeywordMatchType","KeywordCOSMORelationship","KeywordBuyerStage","KeywordNotes"].map((col) => (
                      <th key={col} onClick={() => { setSortCol(col); setSortAsc(sortCol === col ? !sortAsc : false); }}
                        className="px-2.5 py-2 text-left font-bold text-zinc-500 cursor-pointer hover:text-zinc-300 whitespace-nowrap select-none">
                        {col.replace("Keyword","").replace(/([A-Z])/g," $1").trim()}
                        {sortCol === col && <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredKeywords.map((kw, i) => (
                    <tr key={i} className="border-t border-surface-4 hover:bg-surface-2/50">
                      <td className="px-2.5 py-1.5 font-medium text-zinc-200 max-w-[200px]">
                        <span className="block text-justify leading-relaxed">{kw.KeywordText}</span>
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-zinc-300">{kw.KeywordSearchVolume?.toLocaleString()}</td>
                      <td className="px-2.5 py-1.5"><TierBadge tier={kw.KeywordPriorityTier} /></td>
                      <td className="px-2.5 py-1.5 text-zinc-400">{kw.KeywordSearchIntent}</td>
                      <td className="px-2.5 py-1.5 text-zinc-400">{kw.KeywordPrimaryUseLocation}</td>
                      <td className="px-2.5 py-1.5 text-zinc-400">{kw.KeywordMatchType}</td>
                      <td className="px-2.5 py-1.5 text-zinc-400 max-w-[120px] truncate" title={kw.KeywordCOSMORelationship}>{kw.KeywordCOSMORelationship}</td>
                      <td className="px-2.5 py-1.5"><StageBadge stage={kw.KeywordBuyerStage} /></td>
                      <td className="px-2.5 py-1.5 text-zinc-500 max-w-[150px]">
                        <span className="block text-justify leading-relaxed">{kw.KeywordNotes}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setStep("parsed")} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">Back to Parsed</button>
            <button onClick={handleRunAI} disabled={isRunningAI} className="rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-brand-950">Re-run AI Tiering</button>
            <button onClick={downloadCSV} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">Download OUT_KEY.csv</button>
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
                  fetch(`/api/projects/${projectId}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phase: "s2_keywords", data: { keywords: tieredKeywords } }),
                  }).catch(() => {});
                }
                setCompletedSteps(new Set(["upload", "parsed", "review", "approved"]));
                setIsApproved(true);
                setStep("approved");
              }}
              className="ml-auto rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S2 — Unlock Reviews (S3)
            </button>
          </div>
        </div>
      )}



      {/* ── Approved ── */}
      {step === "approved" && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-6 text-center">
          <div className="mb-2 text-lg font-extrabold text-accent-green">S2 Keywords — Approved ✓</div>
          <p className="text-sm text-zinc-400 mb-4">{tieredKeywords.length} keywords locked across 4 tiers.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={downloadCSV} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">
              Download OUT_KEY.csv
            </button>
            <button onClick={() => setStep("review")}
              className="rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-brand-950">
              View OUT_KEY →
            </button>
            <a href={`/projects/${projectId}/reviews`} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-bold text-surface-0 hover:bg-brand-400">
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
    <div className="rounded-lg border border-surface-4 bg-surface-1 px-4 py-3">
      <div className={`text-lg font-extrabold ${color === "red" ? "text-accent-red" : color === "green" ? "text-accent-green" : color === "amber" ? "text-accent-amber" : "text-zinc-100"}`}>
        {value}{suffix}
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function TierCard({ tier, count, label, color, min }: { tier: string; count: number; label: string; color: string; min: number }) {
  const ok = count >= min;
  return (
    <div className="rounded-lg border border-surface-4 bg-surface-1 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className={`text-lg font-extrabold ${color}`}>{count}</span>
        <span className="text-[10px] font-bold text-zinc-500">{tier}</span>
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
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
    T4: "bg-zinc-700/30 text-zinc-400",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold ${colors[tier] || "bg-surface-4 text-zinc-500"}`}>
      {tier}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    Decision: "text-brand-400",
    Consideration: "text-accent-blue",
    Awareness: "text-zinc-400",
  };
  return <span className={`text-[10px] font-bold ${colors[stage] || "text-zinc-500"}`}>{stage}</span>;
}
