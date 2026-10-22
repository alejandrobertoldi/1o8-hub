/* eslint-disable react-doctor/no-render-in-render */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { priorUsageCols, usedInPrior, willBeUsed, pendingForAll } from "@/lib/seo/keyword-usage";
import { COMPLIANCE } from "@/lib/seo-pipeline-config";
import React, { useState, useCallback, useEffect, useMemo } from "react";
import { resolveGuidelinesFieldByField, renderGuidelinesBlock, type ContentGuidelines } from "@/lib/variation-guidelines";
import { useSectionHeader } from "@/components/seo/project-shell";
import { getProjectState } from "@/components/seo/project-shell";
import { seoExportFilename } from "@/lib/seo/export-filename";
import AIGeneratingButton from "@/components/seo/ai-generating-button";
import { Loader2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { mergeKeywordSources } from "@/lib/seo/keyword-merge";
import { AsinLink, PARENTAGE_STYLES } from "@/components/seo/target-display";
import { AmazonPdpLink } from "@/components/amazon-pdp-link";
import { Sku } from "@/components/sku";
import { SummarizedTitle } from "@/components/summarized-title";
import { useParams } from "next/navigation";
import { computeHumanScore, supersededPaths, toggleAcceptedPath, type HumanScore } from "@/lib/seo/human-score-rules";
import { highlightKeywords } from "@/components/seo/highlight-keywords";
import { showBatchStack, batchCardStartsOpen, s6SectionState, s6SectionStartsOpen, lockState, type S6SectionKey } from "@/lib/seo/s6-batch-stack";
import { useSession } from "next-auth/react";
import { RevisionStrip } from "@/components/seo/revision/revision-strip";
import { RevisionReviewPanel } from "@/components/seo/revision/revision-review-panel";
import { FIELD_LABELS } from "@/lib/seo/revision-fields";
import { hasSuperPowers } from "@/lib/roles";


// ═══════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════
const OUT_SEO_COLS = [
  "ASIN","URL","VariationID","VariationProduct","ParentageLevel","VariationThemeName",
  "Flavor","Style","Color","Size",
  "Title","Title_CharLength",
  "ItemHighlight","ItemHighlight_CharLength",
  "DetailedBulletPoint_1","DetailedBulletPoint_1_CharLength",
  "DetailedBulletPoint_2","DetailedBulletPoint_2_CharLength",
  "DetailedBulletPoint_3","DetailedBulletPoint_3_CharLength",
  "DetailedBulletPoint_4","DetailedBulletPoint_4_CharLength",
  "DetailedBulletPoint_5","DetailedBulletPoint_5_CharLength",
  "ProductDescription","ProductDescription_CharLength",
  "BackendSearchTerms","BackendSearchTerms_ByteLength",
];

// Per-field char/byte maxima for the length-cell meter (red when over).
const FIELD_MAX: Record<string, number> = {
  Title_CharLength: 75,
  ItemHighlight_CharLength: 125,
  ...Object.fromEntries(Array.from({length:5},(_,i)=>[`DetailedBulletPoint_${i+1}_CharLength`, 200])),
  ProductDescription_CharLength: 1200,
  BackendSearchTerms_ByteLength: 500,
};

// Content columns (the ones where keyword highlighting applies)
const CONTENT_COLS = new Set([
  "Title",
  "ItemHighlight",
  ...Array.from({length:5},(_,i)=>`DetailedBulletPoint_${i+1}`),
  "ProductDescription",
  "BackendSearchTerms",
]);

// Restricted/compliance words — highlighted blue in content
// Same list the generator is told to avoid (single source in seo-pipeline-config).
const RESTRICTED_WORDS: readonly string[] = COMPLIANCE.restricted_words;

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
type BatchKey = "titles"|"bullets"|"description"|"backend";
type BatchStatus = "pending"|"generating"|"review"|"approved"|"revision";
type OutSeoRow = Record<string, string|number>;
interface BatchState { status: BatchStatus; feedback: string; }
interface KwInfo { text: string; tier: number; volume: number; }

// Content batches — codes match the S6 sub-steps in the left menu (S6.2–S6.5)
const BATCHES: {key:BatchKey;label:string;code:string}[] = [
  {key:"titles",label:"Titles",code:"S6.2"},
  {key:"bullets",label:"Bullet Points",code:"S6.3"},
  {key:"description",label:"Description",code:"S6.4"},
  {key:"backend",label:"Backend Search Terms",code:"S6.5"},
];

const BATCH_PASSES: Record<BatchKey, {pass:number;label:string;detail:string}[]> = {
  titles: [
    {pass:1, label:"Pass 1 — Content generation", detail:"Generating titles with keyword & COSMO context"},
    {pass:2, label:"Pass 2 — Voice & tone",        detail:"Polishing to native American English voice"},
    {pass:3, label:"Pass 3 — CMOS editorial",       detail:"Applying Chicago Manual of Style rules"},
  ],
  bullets: [
    {pass:1, label:"Pass 1 — Content generation",       detail:"Generating bullets with keyword & COSMO context"},
    {pass:2, label:"Pass 2 — Voice & tone",              detail:"Polishing to native American English voice"},
    {pass:3, label:"Pass 3 — CMOS editorial",            detail:"Applying Chicago Manual of Style rules"},
    {pass:4, label:"Pass 4 — Coherence + Human Score",   detail:"Checking bullet flow & scoring AI-detectability"},
  ],
  description: [
    {pass:1, label:"Pass 1 — Content generation", detail:"Generating descriptions with COSMO & Alexa for Shopping context"},
  ],
  backend: [
    {pass:1, label:"Pass 1 — Content generation", detail:"Generating backend search terms"},
  ],
};

const STEPS = [
  {key:"config",label:"S6.1 Configuration"},
  {key:"batch-titles",label:"S6.2 Titles"},
  {key:"batch-bullets",label:"S6.3 Bullets"},
  {key:"batch-description",label:"S6.4 Description"},
  {key:"batch-backend",label:"S6.5 Backend"},
  {key:"audit",label:"S6.6 Audit & Optimize"},
  {key:"aplus-qa",label:"S6.7 Premium A+ Q&A"},
  {key:"final",label:"S6.8 Final SEO Content"},
  {key:"review",label:"S7 Review & Share"},
  {key:"push",label:"S8 Push Content"},
];

// Bullets are ONE set of 5 (stored as DetailedBulletPoint_1..5); Concise / Content /
// Key Features were retired 2026-09-29.
const BULLET_COLS = Array.from({length:5},(_,i)=>`DetailedBulletPoint_${i+1}`);
const BULLET_MAX = 200;

// ═══════════════════════════════════════════════════════════
// FIND USED KEYWORDS IN CONTENT
// ═══════════════════════════════════════════════════════════
function findUsedKeywords(rows: OutSeoRow[], allKws: KwInfo[], cols: string[]): KwInfo[] {
  const allText = rows.map(r => cols.filter(c => CONTENT_COLS.has(c)).map(c => String(r[c] || "").toLowerCase()).join(" ")).join(" ");
  const used: KwInfo[] = [];
  const seen = new Set<string>();
  for (const kw of allKws) {
    if (seen.has(kw.text)) continue;
    if (allText.includes(kw.text.toLowerCase())) {
      used.push(kw);
      seen.add(kw.text);
    }
  }
  return used.sort((a, b) => a.tier - b.tier || a.text.localeCompare(b.text));
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════
export default function SEOPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [step, setStep] = useState("config");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string|null>(null);
  // Google Doc export
  const [exportingDoc, setExportingDoc] = useState(false);
  const [exportError, setExportError] = useState<string|null>(null);
  // Compliance dismissed findings (by term+batch key)
  const [dismissedFindings, setDismissedFindings] = useState<Set<string>>(new Set());
  // Inline cell editing: key = "ASIN::colName"
  const [editingCell, setEditingCell] = useState<string|null>(null);
  const [editingValue, setEditingValue] = useState("");
  // Content locking — locked cells are preserved during regeneration
  const [lockedCells, setLockedCells] = useState<Set<string>>(new Set());

  // Research data
  const [brandName, setBrandName] = useState("");
  const [asins, setAsins] = useState<any[]>([]);
  // Summarized titles for the Product column (keyed ASIN::SKU, plus ASIN fallback)
  const [listingMeta, setListingMeta] = useState<Record<string, { productId: string; summarizedTitle: string | null; thumbnailUrl?: string | null }>>({});
  useEffect(() => {
    fetch(`/api/seo/projects/${projectId}/listing-meta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setListingMeta(d?.meta || {}))
      .catch(() => {});
  }, [projectId]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [sqp, setSqp] = useState<any>(null);
  const [cosmoRows, setCosmoRows] = useState<any[]>([]);
  const [rufusRows, setRufusRows] = useState<any[]>([]);
  const [reviewRows, setReviewRows] = useState<any[]>([]);
  const [guidelines, setGuidelines] = useState("");
  const [variationGuidelines, setVariationGuidelines] = useState<{
    defaults: ContentGuidelines | null;
    groups: Array<{ name: string; contentGuidelines: ContentGuidelines | null }>;
  } | null>(null);

  // Config
  const [sizePlacement, setSizePlacement] = useState<string|null>(null);
  const [hasSizeVariation, setHasSizeVariation] = useState(false);

  // Master rows
  const [rows, setRows] = useState<OutSeoRow[]>([]);

  // Batches
  const [batches, setBatches] = useState<Record<BatchKey, BatchState>>({
    titles:{status:"pending",feedback:""}, bullets:{status:"pending",feedback:""},
    description:{status:"pending",feedback:""}, backend:{status:"pending",feedback:""},
  });
  const [isApproved, setIsApproved] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [approvedRevision, setApprovedRevision] = useState<{ id: string; revisionNumber: number } | null>(null);
  const [revisionRefresh, setRevisionRefresh] = useState(0);
  // S6.9 shows the review inline: the newest revision by default, or one picked from History
  const [reviewRevisionId, setReviewRevisionId] = useState<string | null>(null);
  const { data: session } = useSession();
  const [revisionText, setRevisionText] = useState("");
  // S6.8's own feedback box — the batch cards are on screen at the same time and use revisionText
  const [finalRevisionText, setFinalRevisionText] = useState("");

  // Audit
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditFeedback, setAuditFeedback] = useState("");
  const [polishRunning, setPolishRunning] = useState(false);
  const [polishLog, setPolishLog] = useState<string[]>([]);

  // Pass progress — updated via SSE events during generation
  const [generatingPass, setGeneratingPass] = useState(0);

  // Premium A+ Q&A (S6.7)
  const [aplusQA, setAplusQA] = useState<Array<{asin:string; questions:{q:string;a:string;qLen?:number;aLen?:number}[]}>>([]);
  const [generatingQA, setGeneratingQA] = useState(false);
  const [qaError, setQaError] = useState<string|null>(null);

  // Human Score — returned by Pass 4 coherence check (bullets batch only)
  const [humanScores, setHumanScores] = useState<any[]>([]);
  const [humanScoreOpen, setHumanScoreOpen] = useState<Record<string,boolean>>({});
  const [hsPathBypassed, setHsPathBypassed] = useState<Record<string, Set<number>>>({});

  // Compliance — per batch
  const [batchCompliance, setBatchCompliance] = useState<Record<BatchKey, {findings:any[];checked:boolean}>>({
    titles:{findings:[],checked:false}, bullets:{findings:[],checked:false},
    description:{findings:[],checked:false}, backend:{findings:[],checked:false},
  });
  // Config instructions (general guidance for all batches)
  const [configInstructions, setConfigInstructions] = useState("");

  // Skill results (S0 competitive only — validation & GEO merged into S6.6 audit)
  const [skillResults, setSkillResults] = useState<{
    competitive: any; config: any;
  }>({ competitive: null, config: null });
  const [skillRunning, setSkillRunning] = useState<string | null>(null);

  // Rewrite suggestions from premium audit
  const [acceptedRewrites, setAcceptedRewrites] = useState<Set<number>>(new Set());
  const [rewriteLoading, setRewriteLoading] = useState(false);

  // Migration state
  const [migrationPreview, setMigrationPreview] = useState<any>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  // A push recorded in an earlier session (migrationResult only knows about this session's push)
  const [pushedBefore, setPushedBefore] = useState(false);

  // Refine Backend Keywords (on-demand, no full regeneration)
  const [refiningBackend, setRefiningBackend] = useState(false);
  // One-click Regenerate confirm state — which batch's confirm is showing (batches are stacked)
  const [regenConfirmKey, setRegenConfirmKey] = useState<BatchKey | null>(null);

  // ── Keyword map for highlighting ──
  const allKws = useMemo<KwInfo[]>(() =>
    keywords.map((k: any) => ({ text: String(k.KeywordText || "").toLowerCase(), tier: Number(k.KeywordPriorityTier?.replace('T','')) || Number(k.KeywordTier) || 4, volume: Number(k.KeywordSearchVolume) || 0 }))
      .filter(k => k.text.length > 1),
    [keywords]
  );
  const kwMap = useMemo(() => {
    const m = new Map<string, number>();
    allKws.forEach(k => { if (!m.has(k.text)) m.set(k.text, k.tier); });
    return m;
  }, [allKws]);

  const restrictedSet = useMemo(() => new Set(RESTRICTED_WORDS.map(w => w.toLowerCase())), []);

  // Keyword selection state for include/remove actions
  const [selectedUnused, setSelectedUnused] = useState<Set<string>>(new Set());
  const [selectedUsed, setSelectedUsed] = useState<Set<string>>(new Set());
  // Keyword table: show every not-used row, per batch
  const [showAllKw, setShowAllKw] = useState<Partial<Record<BatchKey, boolean>>>({});
  // Keyword table sort, per batch (null = default order: SQP purchases, then volume)
  const [kwSort, setKwSort] = useState<Partial<Record<BatchKey, { key: string; dir: "asc" | "desc" }>>>({});

  // ── Load all data ──
  useEffect(() => {
    async function loadAll() {
      try {
        const [s1R, s2R, s3R, s4R, s5R] = await Promise.all([
          fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`),
          fetch(`/api/seo/projects/${projectId}/load?phase=s2_keywords`),
          fetch(`/api/seo/projects/${projectId}/load?phase=s3_reviews`),
          fetch(`/api/seo/projects/${projectId}/load?phase=s4_rufus`),
          fetch(`/api/seo/projects/${projectId}/load?phase=s5_cosmo`),
        ]);
        const s1=await s1R.json(), s2=await s2R.json(), s3=await s3R.json(), s4=await s4R.json(), s5=await s5R.json();

        setBrandName(s1.project?.brand_name||"");
        setAsins(s1.asins||[]);
        setGuidelines(s1.project?.brand_guidelines||"");
        setVariationGuidelines(s1.project?.variation_guidelines ?? null);
        setKeywords(s2.keywords||[]);
        setReviewRows(s3.reviews||[]);
        setRufusRows(s4.rows||[]);
        setCosmoRows(s5.rows||[]);
        setHasSizeVariation((s1.asins||[]).some((a:any)=>a.size&&a.size!=="Parent"&&a.size.trim()));

        // Per-ASIN SQP ranking (non-blocking; falls back silently if unavailable)
        fetch(`/api/seo/projects/${projectId}/sqp`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setSqp(d))
          .catch((err) => {
            console.warn(`[seo/sqp] SQP fetch failed for project ${projectId}; rendering Helium 10 fallback.`, err);
            setSqp({ available: false, reason: "redshift-error" });
          });

        const initRows: OutSeoRow[] = (s1.asins||[]).map((a:any)=>{
          const r: OutSeoRow = {}; OUT_SEO_COLS.forEach(c=>{r[c]="";}); 
          r.ASIN=a.asin||""; r.URL=a.amazon_url||""; r.VariationID=a.variation_id||"";
          r.VariationProduct=a.variation_product||""; r.ParentageLevel=a.parentage_level||"";
          r.VariationThemeName=a.variation_theme_name||""; r.Flavor=a.flavor||"";
          r.Style=a.style||""; r.Color=a.color||""; r.Size=a.size||"";
          return r;
        });

        const savedR = await fetch(`/api/seo/projects/${projectId}/load?phase=s7_seo`);
        const sortRows = (r: OutSeoRow[]) => r.sort((a,b)=>{
          const aP=String(a.ParentageLevel||'').toLowerCase()==='parent';
          const bP=String(b.ParentageLevel||'').toLowerCase()==='parent';
          if(aP&&!bP)return -1; if(!aP&&bP)return 1;
          return String(a.ASIN||'').localeCompare(String(b.ASIN||''));
        });
        if (savedR.ok) {
          const saved = await savedR.json();
          if (saved.rows?.length > 0) {
            // Merge saved content onto initRows so ASIN metadata is always fresh from S1
            const mergedRows = sortRows(initRows.map((ir:OutSeoRow) => {
              const sr = (saved.rows||[]).find((r:any)=>r.ASIN===ir.ASIN);
              if (!sr) return ir;
              const merged = {...ir};
              OUT_SEO_COLS.forEach(c=>{ if(sr[c]!==undefined && sr[c]!=="") (merged as any)[c]=sr[c]; });
              if (sr._humanScore) (merged as any)._humanScore = sr._humanScore;
              if (sr._aplusQA) (merged as any)._aplusQA = sr._aplusQA;
              return merged;
            }));
            setRows(mergedRows);
            // Restore persisted Human Scores from generatedContent
            const savedHs = mergedRows.map((r: any) => r._humanScore).filter(Boolean);
            if (savedHs.length > 0) setHumanScores(savedHs);
            // Restore persisted A+ Q&A from generatedContent
            const savedQA = mergedRows
              .filter((r: any) => r._aplusQA?.length)
              .map((r: any) => ({ asin: r.ASIN, questions: r._aplusQA }));
            if (savedQA.length > 0) setAplusQA(savedQA);
            setSizePlacement(saved.config?.size_placement||"end");
            const inProgress = saved.config?.in_progress !== false;
            if (!inProgress) {
              // Fully approved — go to final
              setBatches({titles:{status:"approved",feedback:""},bullets:{status:"approved",feedback:""},
                description:{status:"approved",feedback:""},backend:{status:"approved",feedback:""}});
              setIsApproved(true); setStep("final");
              // Auto-lock all content cells for approved projects
              if (saved.config?.lockedCells) {
                setLockedCells(new Set(saved.config.lockedCells));
              } else {
                const autoLocked = new Set<string>();
                const allCols = ["Title",...Array.from({length:5},(_,i)=>`DetailedBulletPoint_${i+1}`),"ProductDescription","BackendSearchTerms"];
                for (const row of mergedRows) for (const col of allCols) if (String(row[col]||"").trim()) autoLocked.add(`${row.ASIN}::${col}`);
                setLockedCells(autoLocked);
              }
            } else {
              // Restore exact mid-progress batch states and step
              // Restore locked cells — or auto-lock all existing content for legacy saves
              if (saved.config?.lockedCells) {
                setLockedCells(new Set(saved.config.lockedCells));
              } else {
                // Legacy: no lock state saved — auto-lock every non-empty content cell
                const autoLocked = new Set<string>();
                const allContentCols = [...new Set([
                  "Title",
                  ...Array.from({length:5},(_,i)=>`DetailedBulletPoint_${i+1}`),
                  "ProductDescription","BackendSearchTerms",
                ])];
                for (const row of mergedRows) {
                  for (const col of allContentCols) {
                    if (String(row[col]||"").trim()) autoLocked.add(`${row.ASIN}::${col}`);
                  }
                }
                setLockedCells(autoLocked);
              }
              const savedBatches = saved.config?.batches;
              if (savedBatches) {
                setBatches(savedBatches);
              } else {
                // Legacy: derive batch status from content presence
                const hasTitle = mergedRows.some((r:OutSeoRow)=>!!r.Title);
                const hasBullets = mergedRows.some((r:OutSeoRow)=>!!r.DetailedBulletPoint_1);
                const hasDesc = mergedRows.some((r:OutSeoRow)=>!!r.ProductDescription);
                const hasBackend = mergedRows.some((r:OutSeoRow)=>!!r.BackendSearchTerms);
                setBatches({
                  titles:{status:hasTitle?"approved":"pending",feedback:""},
                  bullets:{status:hasBullets?"approved":"pending",feedback:""},
                  description:{status:hasDesc?"approved":"pending",feedback:""},
                  backend:{status:hasBackend?"approved":"pending",feedback:""},
                });
              }
              // Compute correct step: if saved step points to an already-approved batch, advance
              const restoredBatches = savedBatches || {
                titles:{status:mergedRows.some((r:OutSeoRow)=>!!r.Title)?"approved":"pending",feedback:""},
                bullets:{status:mergedRows.some((r:OutSeoRow)=>!!r.DetailedBulletPoint_1)?"approved":"pending",feedback:""},
                description:{status:mergedRows.some((r:OutSeoRow)=>!!r.ProductDescription)?"approved":"pending",feedback:""},
                backend:{status:mergedRows.some((r:OutSeoRow)=>!!r.BackendSearchTerms)?"approved":"pending",feedback:""},
              };
              let computedStep = saved.config?.step || "batch-titles";
              // Fallback: "insights" step was removed — map to "audit"
              if (computedStep === "insights") computedStep = "audit";
              // If the saved step is a batch step and that batch is already approved, advance to next pending
              if (computedStep.startsWith("batch-")) {
                const bk = computedStep.replace("batch-","") as BatchKey;
                if (restoredBatches[bk]?.status === "approved") {
                  const nextPending = BATCHES.find(b => restoredBatches[b.key]?.status !== "approved");
                  computedStep = nextPending ? `batch-${nextPending.key}` : "audit";
                }
              }
              setStep(computedStep);
            }
          } else setRows(sortRows(initRows));
        } else setRows(sortRows(initRows));
      } catch(e: unknown){setError(e instanceof Error ? e.message : String(e));}
      setLoading(false);

      // Load skill results + saved audit (non-blocking)
      try {
        const [skillR, auditR] = await Promise.all([
          fetch(`/api/seo/projects/${projectId}/run-skill`),
          fetch(`/api/seo/projects/${projectId}/audit-result`),
        ]);
        if (skillR.ok) {
          const skillData = await skillR.json();
          setSkillResults(skillData);
        }
        if (auditR.ok) {
          const auditData = await auditR.json();
          if (auditData.result) setAuditResult(auditData.result);
        }
      } catch { /* non-critical */ }
    }
    loadAll();
  }, [projectId]);

  // ── Merge batch data ──
  const mergeBatchData = useCallback((batchRows: any[]) => {
    setRows(prev => {
      const upd = [...prev];
      for (const br of batchRows) {
        const idx = upd.findIndex(r => r.ASIN === br.ASIN);
        if (idx === -1) continue;
        for (const key of Object.keys(br)) { if (OUT_SEO_COLS.includes(key)) upd[idx][key] = br[key]; }
      }
      return upd;
    });
  }, []);

  // ── Generate ──
  const generateBatch = useCallback(async (bk: BatchKey, feedbackOverride?: string) => {
    setGenerating(true); setError(null); setGeneratingPass(0);
    setBatches(p=>({...p,[bk]:{...p[bk],status:"generating"}}));
    try {
      const controller = new AbortController();
      const timeoutMs = bk === "bullets" ? 280_000 : 130_000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // Build feedback with lock context — tell Claude which fields to focus on
      let feedbackWithLocks = (feedbackOverride ?? batches[bk].feedback) || "";
      const batchCols = getAllBatchContentCols(bk);
      const unlockedFields: string[] = [];
      const lockedFields: string[] = [];
      for (const col of batchCols) {
        // Check if ANY ASIN has this col locked
        const allLocked = rows.every(r => lockedCells.has(`${r.ASIN}::${col}`));
        if (allLocked) lockedFields.push(col);
        else unlockedFields.push(col);
      }
      if (lockedFields.length > 0 && unlockedFields.length > 0) {
        const lockNote = `\n\nLOCKED FIELDS (return these EXACTLY as provided in currentRows — do NOT modify): ${lockedFields.join(", ")}.\nONLY regenerate these fields: ${unlockedFields.join(", ")}.`;
        feedbackWithLocks = (feedbackWithLocks ? feedbackWithLocks + lockNote : lockNote).trim();
      }
      // Currently-used keywords across this batch's content cols — passed to API
      // so the prompt can require Claude to keep them verbatim (unless feedback
      // explicitly REMOVEs them). Without this, "ADD X" can silently drop
      // existing similar phrases (e.g. "elastic knee support" → "elastic knee sleeve").
      const usedKeywords = feedbackWithLocks
        ? findUsedKeywords(rows, allKws, getAllBatchContentCols(bk)).map(k => k.text)
        : [];
      const firstGroupName = asins[0]?.variation_group ?? null;
      const groupGl = variationGuidelines?.groups.find(g => g.name === firstGroupName)?.contentGuidelines ?? null;
      const listingGl = (asins[0] as any)?.listing_guidelines ?? null;
      const resolvedGl = resolveGuidelinesFieldByField(listingGl, groupGl, variationGuidelines?.defaults ?? null);
      const variationGuidelinesText = resolvedGl ? renderGuidelinesBlock(resolvedGl) : undefined;

      let res: Response;
      try {
        res = await fetch(`/api/seo/claude/seo`,{method:"POST",headers:{"Content-Type":"application/json"},
          signal: controller.signal,
          body:JSON.stringify({batch:bk,brandName,asins,projectId,keywords:keywords.slice(0,60),
            cosmo:cosmoRows.slice(0,15).map((c:any)=>({COSMORelationType:c.COSMORelationType,COSMOMappedValue:c.COSMOMappedValue,COSMOEntity:c.COSMOEntity})),
            rufus:rufusRows.slice(0,10).map((r:any)=>({RufusQuestion:r.RufusQuestion,RufusAnswer:(r.RufusAnswer||"").substring(0,150),RufusCOSMORelationship:r.RufusCOSMORelationship})),
            reviews:reviewRows.slice(0,15).map((r:any)=>({ReviewTheme:r.ReviewKeyThemes,ReviewRufusUsableInsight:r.ReviewRufusUsableInsight,ReviewSentiment:r.ReviewSentiment})),
            guidelines:guidelines||undefined,variationGuidelinesText,sizePlacement,currentRows:rows,
            feedback:feedbackWithLocks||undefined,usedKeywords,configInstructions:configInstructions||undefined})});
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? `Generation timed out — ${bk} with ${asins.length} ASINs is a large batch. Please try again.`
          : `Network error generating ${bk}. Check your connection and try again.`);
      } finally { clearTimeout(timer); }
      if(!res.ok) throw new Error(await res.text());
      // Read SSE stream — updates generatingPass on each progress event
      let data: any = null;
      {
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "progress") setGeneratingPass(evt.pass);
              else if (evt.type === "result") data = evt;
              else if (evt.type === "error") throw new Error(evt.error);
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== "SyntaxError") throw parseErr;
            }
          }
        }
        if (!data) throw new Error(`No result received for ${bk}`);
      }
      const incomingHumanScores: any[] = (bk === "bullets" && Array.isArray(data.humanScores) && data.humanScores.length > 0) ? data.humanScores : [];
      if (incomingHumanScores.length > 0) {
        setHumanScores(incomingHumanScores);
        setHumanScoreOpen({});
        setHsPathBypassed({});
      }
      // Compute merged rows in pure JS — no state reads, guaranteed fresh
      const batchRows: any[] = data.rows || [];
      // Cells inside the batch being (re)generated must always overwrite, even
      // when auto-locked from a prior generation — otherwise a regenerate-with-
      // feedback silently keeps the old content. Lock state still protects
      // cells OUTSIDE the batch (e.g. Title cells when regenerating bullets).
      const regeneratingCols = new Set(getAllBatchContentCols(bk));
      const freshRows: OutSeoRow[] = rows.map(r => {
        const br = batchRows.find((b: any) => b.ASIN === r.ASIN);
        if (!br) return r;
        const merged = {...r};
        for (const key of Object.keys(br)) {
          if (!OUT_SEO_COLS.includes(key)) continue;
          const isInBatch = regeneratingCols.has(key);
          const isLocked = lockedCells.has(`${r.ASIN}::${key}`);
          if (isInBatch || !isLocked) (merged as any)[key] = br[key];
        }
        return merged;
      });
      // Auto-lock all generated content cells for this batch
      const batchContentCols = getAllBatchContentCols(bk);
      const newLocked = new Set(lockedCells);
      for (const row of freshRows) {
        for (const col of batchContentCols) {
          if (String(row[col] || "").trim()) newLocked.add(`${row.ASIN}::${col}`);
        }
      }
      setLockedCells(newLocked);
      // Inject humanScore into each row so autoSave persists it in generatedContent JSONB
      const rowsWithScore = incomingHumanScores.length > 0
        ? freshRows.map(r => {
            const hs = incomingHumanScores.find((s: any) => s.asin === r.ASIN);
            return hs ? { ...r, _humanScore: hs } : r;
          })
        : freshRows;
      // Commit to state
      setRows(rowsWithScore);
      const freshBatches = {...batches, [bk]:{status:"review" as const, feedback:""}};
      setBatches(freshBatches);
      // Run compliance directly on freshRows — zero async dependency
      scanCompliance(bk, rowsWithScore);
      // Auto-save progress so navigating away never loses content
      await autoSave(rowsWithScore, freshBatches, `batch-${bk}`, newLocked);
    } catch(e: unknown){ setError(e instanceof Error ? e.message : String(e)); setBatches(p=>({...p,[bk]:{...p[bk],status:"review"}})); }
    setGenerating(false); setGeneratingPass(0);
  },[brandName,asins,keywords,cosmoRows,rufusRows,reviewRows,guidelines,sizePlacement,rows,batches,mergeBatchData,configInstructions,lockedCells]);

  // ── Refine Backend Keywords ──
  const refineBackend = useCallback(async () => {
    setRefiningBackend(true);
    setError(null);
    try {
      const res = await fetch("/api/seo/claude/seo-backend-refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, keywords: keywords.slice(0, 60), guidelines: guidelines || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!Array.isArray(data.rows) || data.rows.length === 0) throw new Error("No rows returned");
      const updatedRows: OutSeoRow[] = rows.map(r => {
        const upd = data.rows.find((u: any) => u.ASIN === r.ASIN);
        if (!upd) return r;
        return { ...r, BackendSearchTerms: upd.BackendSearchTerms, BackendSearchTerms_ByteLength: upd.BackendSearchTerms_ByteLength };
      });
      setRows(updatedRows);
      await autoSave(updatedRows, batches, "batch-backend", lockedCells);
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRefiningBackend(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, keywords, batches, lockedCells, guidelines]);

  // Short display label for a column name
  const colShortLabel = (col: string): string => {
    if (col === "Title") return "Title";
    if (col === "ProductDescription") return "Desc";
    const map: Record<string,string> = { Detailed:"BP" };
    for (const [type, short] of Object.entries(map)) {
      // eslint-disable-next-line react-doctor/js-hoist-regexp
      const m = col.match(new RegExp(`^${type}BulletPoint_(\\d)$`));
      if (m) return `${short}${m[1]}`;
    }
    if (col === "BackendSearchTerms") return "Backend";
    if (col === "BackendSearchTerms_ByteLength") return "Bytes";
    return col;
  };

  // scanCompliance: pure function — receives all data as args, no closure deps
  const scanCompliance = (bk: BatchKey, scanRows: OutSeoRow[]) => {
    const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/u;
    const batchCols: Record<BatchKey, string[]> = {
      titles: ["Title"],
      bullets: BULLET_COLS,
      description: ["ProductDescription"],
      backend: ["BackendSearchTerms"],
    };
    const cols = batchCols[bk];
    const findings: any[] = [];
    let fid = 0;
    for (const row of scanRows) {
      for (const col of cols) {
        const val: string = String((row as any)[col] || "");
        if (!val.trim()) continue;
        const lower = val.toLowerCase();
        for (const term of RESTRICTED_WORDS) {
          // Word-boundary match: term must not be surrounded by alphanumeric chars
          // eslint-disable-next-line react-doctor/js-hoist-regexp
          const re = new RegExp(`(?<![a-z])${term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?![a-z])`, "i");
          if (re.test(lower)) {
            findings.push({ id: `f-${fid++}`, severity: "critical", field: col, shortField: colShortLabel(col), asin: row.ASIN, detail: `Prohibited term: "${term}"`, term });
          }
        }
        if (EMOJI_RE.test(val)) {
          findings.push({ id: `f-${fid++}`, severity: "critical", field: col, shortField: colShortLabel(col), asin: row.ASIN, detail: "Contains emoji (prohibited)" });
        }
        if (bk === "titles" && val.includes(":")) {
          findings.push({ id: `f-${fid++}`, severity: "critical", field: col, shortField: colShortLabel(col), asin: row.ASIN, detail: "Title contains colon (prohibited)" });
        }
        if (bk === "description" && val.includes(":")) {
          findings.push({ id: `f-${fid++}`, severity: "critical", field: col, shortField: colShortLabel(col), asin: row.ASIN, detail: "Description contains colon (prohibited)" });
        }
        if (bk === "backend") {
          if (/[,;.!?]/.test(val)) findings.push({ id: `f-${fid++}`, severity: "warning", field: col, shortField: colShortLabel(col), asin: row.ASIN, detail: "Backend terms should have no punctuation" });
          if (/[A-Z]/.test(val)) findings.push({ id: `f-${fid++}`, severity: "warning", field: col, shortField: colShortLabel(col), asin: row.ASIN, detail: "Backend terms should be lowercase" });
        }
      }
    }
    setBatchCompliance(p => ({...p, [bk]:{findings, checked:true}}));
  };

  // ── Auto-save progress (rows + batches state + step + locks) ──
  const autoSave = useCallback(async (freshRows: OutSeoRow[], freshBatches: Record<BatchKey,BatchState>, currentStep: string, freshLocked?: Set<string>) => {
    try {
      await fetch(`/api/seo/projects/${projectId}/save`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({phase:"s7_seo",data:{
          rows: freshRows,
          config:{ size_placement: sizePlacement, batches: freshBatches, step: currentStep, in_progress: true,
            lockedCells: [...(freshLocked || lockedCells)] }
        }})});
    } catch(e){ /* silent — don't block UI */ }
  },[projectId,sizePlacement,lockedCells]);

  const approveBatch = useCallback((bk: BatchKey) => {
    const freshBatches = {...batches, [bk]:{...batches[bk], status:"approved" as const}};
    setBatches(freshBatches);
    const bi = BATCHES.findIndex(b=>b.key===bk);
    const nextStep = bi < BATCHES.length-1 ? `batch-${BATCHES[bi+1].key}` : "audit";
    setStep(nextStep);
    autoSave(rows, freshBatches, nextStep);
  },[batches, rows, autoSave]);

  const reviseBatch = useCallback((bk: BatchKey, fb: string) => {
    setBatches(p=>({...p,[bk]:{...p[bk],status:"revision",feedback:fb}}));
  },[]);

  // ── Run skill (only competitive — validation/GEO merged into audit) ──
  const runSkill = useCallback(async (skill: "competitive") => {
    setSkillRunning(skill); setError(null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch(`/api/seo/projects/${projectId}/run-skill`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ skill, force: true }),
        });
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "Skill run timed out. Please try again."
          : "Network error running skill. Check your connection and try again.");
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSkillResults(prev => ({ ...prev, [skill]: data.result }));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    setSkillRunning(null);
  }, [projectId]);

  // ── Accept & Regenerate with audit rewrites ──
  const regenerateWithRewrites = useCallback(() => {
    if (!auditResult?.findings || acceptedRewrites.size === 0) return;

    // Group accepted findings by batch
    const byBatch: Record<string, string[]> = {};
    auditResult.findings.forEach((f: any, i: number) => {
      if (!acceptedRewrites.has(i)) return;
      const bk = f.batch === "all" ? "titles" : f.batch; // default "all" to titles
      if (!byBatch[bk]) byBatch[bk] = [];
      const text = f.rewrite || f.suggestion;
      byBatch[bk].push(`For ${f.asin || "all ASINs"} ${f.field || ""}: ${text}`);
    });

    // Trigger revision for each affected batch
    const batchKeys = Object.keys(byBatch) as BatchKey[];
    for (const bk of batchKeys) {
      reviseBatch(bk, byBatch[bk].join("\n"));
    }

    setAuditResult(null);
    setAcceptedRewrites(new Set());
    // Navigate to first affected batch
    if (batchKeys.length > 0) {
      setStep(`batch-${batchKeys[0]}`);
    }
  }, [auditResult, acceptedRewrites, reviseBatch]);

  // ── Migration preview + execute ──
  const previewMigration = useCallback(async () => {
    setMigrationRunning(true); setError(null); setMigrationResult(null);
    try {
      const res = await fetch(`/api/seo/projects/${projectId}/migrate-to-products`);
      if (!res.ok) throw new Error((await res.json()).error || "Preview failed");
      setMigrationPreview(await res.json());
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    setMigrationRunning(false);
  }, [projectId]);

  const postMigration = useCallback(async (payload: Record<string, unknown>): Promise<any> => {
    const res = await fetch(`/api/seo/projects/${projectId}/migrate-to-products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && Array.isArray(body.drift)) {
      const list = body.drift.map((d: { asin: string; key: string; changedBy: string; changedAt: string }) => `${d.asin} · ${FIELD_LABELS[d.key] ?? d.key} (${d.changedBy}, ${d.changedAt.slice(0, 10)})`).join("\n");
      if (window.confirm(`These fields were edited in the catalog after approval:\n${list}\n\nOverwrite them?`)) return postMigration({ ...payload, confirmDrift: true });
      return null;
    }
    if (!res.ok) throw new Error(body.error ?? "Push failed");
    return body;
  }, [projectId]);

  const executeMigration = useCallback(async () => {
    setMigrationRunning(true); setError(null);
    try {
      const r = await postMigration({});
      if (r) { setMigrationResult(r); setMigrationPreview(null); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMigrationRunning(false); }
  }, [postMigration]);

  const pushWithoutReview = useCallback(async () => {
    const reason = window.prompt("Push without review — why? (recorded)")?.trim();
    if (!reason) return;
    setMigrationRunning(true); setError(null);
    try {
      const r = await postMigration({ override: { reason } });
      if (r) { setMigrationResult(r); setMigrationPreview(null); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMigrationRunning(false); }
  }, [postMigration]);

  // ── Audit ──
  const runAudit = useCallback(async () => {
    setAuditRunning(true); setError(null);
    try {
      const auditCtrl = new AbortController();
      const auditTimer = setTimeout(() => auditCtrl.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch(`/api/seo/claude/seo-audit`,{method:"POST",headers:{"Content-Type":"application/json"},
          signal: auditCtrl.signal,
          body:JSON.stringify({brandName,rows,keywords:keywords.slice(0,60),cosmo:cosmoRows,rufus:rufusRows,
            reviews:reviewRows.slice(0,20),guidelines})});
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "SEO audit timed out. Please try again."
          : "Network error during audit. Check your connection and try again.");
      } finally { clearTimeout(auditTimer); }
      if(!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAuditResult(data);
      // Persist audit result so it survives page refresh
      fetch(`/api/seo/projects/${projectId}/audit-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
      // Persist quality score
      fetch("/api/seo/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          overallScore: data.overallScore,
          complianceScore: data.complianceScore,
          keywordCoverage: data.keywordCoverage,
          cosmoDensity: data.cosmoDensity,
          rufusCoverage: data.rufusCoverage,
          humanVoice: data.humanVoice,
          buyerJourney: data.buyerJourney,
          variationConsistency: data.variationConsistency,
          eeatScore: data.eeatScore,
          readabilityScore: data.readabilityScore,
          citabilityScore: data.citabilityScore,
          geoScore: data.geoScore,
          findingsCount: data.findings?.length || 0,
        }),
      }).catch(() => {}); // fire-and-forget
      setAcceptedRewrites(new Set()); // clear from previous audit run
    } catch(e: unknown){ setError(e instanceof Error ? e.message : String(e)); }
    setAuditRunning(false);
  },[projectId,brandName,rows,keywords,cosmoRows,rufusRows,reviewRows,guidelines]);

  // ── Auto-Polish: regenerate failing batches using audit remediation feedback ──
  const runPolish = useCallback(async () => {
    if (!auditResult?.remediation) return;
    setPolishRunning(true);
    setPolishLog([]);
    const threshold = 70;
    const failingBatches: { key: BatchKey; feedback: string }[] = [];

    // Check which batches have low scores or remediation feedback
    const rem = auditResult.remediation;
    if (rem.titles && auditResult.overallScore < 90) failingBatches.push({ key: "titles", feedback: rem.titles });
    if (rem.bullets && auditResult.overallScore < 90) failingBatches.push({ key: "bullets", feedback: rem.bullets });
    if (rem.description && auditResult.overallScore < 90) failingBatches.push({ key: "description", feedback: rem.description });
    if (rem.backend && auditResult.overallScore < 90) failingBatches.push({ key: "backend", feedback: rem.backend });

    if (failingBatches.length === 0) {
      setPolishLog(["All batches look good — nothing to polish."]);
      setPolishRunning(false);
      return;
    }

    setPolishLog([`Polishing ${failingBatches.length} batch(es): ${failingBatches.map(b => b.key).join(", ")}`]);

    for (const { key, feedback } of failingBatches) {
      setPolishLog(prev => [...prev, `Regenerating ${key}...`]);
      reviseBatch(key, feedback);
    }

    setPolishLog(prev => [...prev, "Batches queued for regeneration. Review and re-audit when ready."]);
    setPolishRunning(false);
    setAuditResult(null); // Clear audit to force re-run after polish
  }, [auditResult, reviseBatch]);

  // ── Save final (marks complete) ──
  const saveFinal = useCallback(async () => {
    try {
      const saved = await fetch(`/api/seo/projects/${projectId}/save`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "s7_seo", data: { rows, config: { size_placement: sizePlacement, in_progress: false } } }) });
      if (!saved.ok) throw new Error("Save failed");
      setIsApproved(true);
      const sub = await fetch(`/api/seo/projects/${projectId}/revisions`, { method: "POST" });
      if (!sub.ok) throw new Error((await sub.json().catch(() => ({}))).error ?? "Submit for review failed");
      setRevisionRefresh((n) => n + 1);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  },[rows,projectId,sizePlacement]);

  // ── Unlock for editing: persisted, so a reload doesn't re-lock (and a stray autosave can't unlock) ──
  const unlockS6 = useCallback(async () => {
    setIsApproved(false); setStep("audit");
    try {
      await fetch(`/api/seo/projects/${projectId}/save`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "s7_seo", data: { rows, config: { size_placement: sizePlacement, batches, step: "audit", in_progress: true, unlock: true, lockedCells: [...lockedCells] } } }) });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }, [projectId, rows, sizePlacement, batches, lockedCells]);

  // ── Google Doc Export (service account → Drive) ──
  const [exportDocUrl, setExportDocUrl] = useState<string|null>(null);
  const exportGoogleDoc = async () => {
    setExportingDoc(true); setExportError(null); setExportDocUrl(null);
    try {
      const res = await fetch(`/api/seo/projects/${projectId}/export-gdoc`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      setExportDocUrl(data.url);
    } catch(e: unknown){ setExportError(e instanceof Error ? e.message : String(e)); }
    setExportingDoc(false);
  };

  // ── CSV ──
  const downloadCSV = useCallback((cols?:string[]) => {
    // The on-screen "Product" column is a display stack — export its real fields instead
    const uc = (cols||OUT_SEO_COLS).flatMap(c => c==="Product" ? ["ASIN","ParentageLevel"] : [c]);
    const csv = [uc.join(","),...rows.map(r=>uc.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=seoExportFilename(getProjectState(projectId).name, cols?"SEO_Content_batch":"SEO_Content"); a.click(); URL.revokeObjectURL(url);
  },[rows]);

  // ── Helpers ──
  const stepIdx = STEPS.findIndex(s=>s.key===step);
  const allApproved = BATCHES.every(b=>batches[b.key].status==="approved");

  const bulletTableCols = ["Product",...BULLET_COLS.flatMap(c=>[c,`${c}_CharLength`])];

  const getBatchContentCols = (bk: BatchKey): string[] => {
    if (bk==="titles") return ["Title","ItemHighlight"];
    if (bk==="bullets") return BULLET_COLS;
    if (bk==="description") return ["ProductDescription"];
    return ["BackendSearchTerms"];
  };

  // All content columns for a batch (one bullet set now, so same as getBatchContentCols)
  const getAllBatchContentCols = getBatchContentCols;

  const seoCompletedSteps = useMemo(() => new Set(STEPS.filter(s => {
    if (s.key.startsWith('batch-')) {
      const bk = s.key.replace('batch-','') as BatchKey;
      return batches[bk].status !== 'pending';
    }
    if (s.key === 'config') return stepIdx > 0;
    const allBatchesDone = Object.values(batches).every(b => b.status !== 'pending');
    if (s.key === 'audit') return allBatchesDone;
    if (s.key === 'final') return isApproved || allBatchesDone;
    // S7 / S8 (shown as top-level phases in the menu): done once a revision is approved / content is pushed
    if (s.key === 'review') return !!approvedRevision;
    if (s.key === 'push') return !!migrationResult || pushedBefore;
    const si = STEPS.findIndex(x=>x.key===s.key);
    return si < stepIdx;
  }).map(s=>s.key)), [batches, stepIdx, isApproved, approvedRevision, migrationResult, pushedBefore]);

  useSectionHeader({
    title: "SEO Content Creation",
    subtitle: `${brandName} • ${asins.length} ASINs • ${OUT_SEO_COLS.length} columns`,
    steps: STEPS,
    currentStep: step,
    onStepClick: setStep,
    completedSteps: seoCompletedSteps,
    isApproved,
  });

  // Batches are stacked: when the step moves to a batch (menu click or approve → next), bring it into view
  useEffect(() => {
    if (!step.startsWith("batch-")) return;
    const el = document.getElementById(`s6-${step}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [step]);

  if (loading) return <div className="flex items-center justify-center py-20"><span className="text-muted-foreground">Loading S6 SEO…</span></div>;

  // ── Stacked S6 cards (S6.1, S6.6–S6.8 share the batch-card look) ──
  const batchStatusMap: Record<string, string> = Object.fromEntries(BATCHES.map(b => [b.key, batches[b.key].status]));
  const sectionStateOf = (key: S6SectionKey) => s6SectionState(key, { step, batchStatuses: batchStatusMap, isApproved, reviewApproved: !!approvedRevision, pushed: !!migrationResult || pushedBefore });
  const pillClass = (st: string) =>
    st === "approved" || st === "done" ? "bg-emerald-500/10 text-emerald-400"
    : st === "review" || st === "current" || st === "generating" ? "bg-amber-500/10 text-amber-400"
    : st === "revision" ? "bg-red-500/10 text-red-400"
    : "bg-muted text-muted-foreground";
  // LOCKED (finished) / UNLOCKED pill on every S6 card
  const lockPill = (status: string) => {
    const locked = lockState(status) === "locked";
    return (
      <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${locked ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
        <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          {locked
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />}
        </svg>
        {locked ? "LOCKED" : "UNLOCKED"}
      </span>
    );
  };
  const stackCard = (id: string, title: string, pill: string, open: boolean, body: React.ReactNode) => (
    <details key={id} id={id} open={open} className="group/batch scroll-mt-20 rounded-full open:rounded-[18px] border border-border bg-card/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {lockPill(pill)}
        <svg className="size-4 shrink-0 text-muted-foreground transition-transform group-open/batch:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
      </summary>
      <div className="space-y-3 border-t border-border px-4 pb-4 pt-4">{body}</div>
    </details>
  );
  // keepMounted: the body stays mounted (hidden) while locked — RevisionStrip must detect an open review on load
  const sectionCard = (key: S6SectionKey, title: string, body: React.ReactNode, keepMounted = false) => {
    const st = sectionStateOf(key);
    return stackCard(`s6-sec-${key}`, title, st, s6SectionStartsOpen(key, st, isApproved),
      st === "locked" ? (
        <>
          <p className="text-xs text-muted-foreground">{key === "review" || key === "push" ? "Save & Submit S6.8 for review first." : "Approve S6.2–S6.5 first."}</p>
          {keepMounted && <div hidden>{body}</div>}
        </>
      ) : body);
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER TABLE — with text wrap + keyword highlighting
  // ═══════════════════════════════════════════════════════════
  // fit=true (batch tables): fixed layout that wraps text to the card width —
  // no horizontal scroll. The final 40-column table keeps fit=false and scrolls.
  // "Product" cell: ASIN, SKU, parentage pill and summarized title stacked in one column
  function renderProductCell(r: OutSeoRow) {
    const asin = String(r.ASIN ?? "");
    const a = asins.find((x: any) => x.asin === asin);
    const sku = String(a?.sku ?? "");
    const level = String(r.ParentageLevel || a?.parentage_level || "").toLowerCase();
    const badge = level === "parent" ? "Parent" : level === "child" ? "Child" : "Standalone";
    const meta = listingMeta[`${asin}::${sku}`] ?? listingMeta[asin];
    const summary = meta?.summarizedTitle ?? String(r.VariationProduct || "");
    // Same look as the Targeted ASINs panel (CoverageRow): parentage pill, orange ASIN link, Amazon icon, muted title
    return (
      <div className="space-y-0.5 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-xs font-bold text-brand"><AsinLink asin={asin} productId={meta?.productId} from="seo-project" /></span>
          <AmazonPdpLink asin={asin} />
        </div>
        {sku && <div className="text-[9px]"><Sku sku={sku} /></div>}
        <SummarizedTitle title={summary} className="text-[11px]" />
        {/* Parentage pill on the last line */}
        <div className="pt-0.5"><span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${PARENTAGE_STYLES[badge.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>{badge}</span></div>
      </div>
    );
  }

  // Full, human column names for S6 table headers
  function fullColumnName(c: string): string {
    const base: Record<string, string> = {
      Identity: "Product", TitleGroup: "Title / Item Highlight", BulletsGroup: "Bullet Points",
      DescGroup: "Product Description", BackendGroup: "Backend Search Terms",
      Title: "Title", ItemHighlight: "Item Highlight", ProductDescription: "Product Description",
      BackendSearchTerms: "Backend Search Terms", VariationProduct: "Variation Product",
      VariationThemeName: "Variation Theme", ParentageLevel: "Parentage Level", VariationID: "Variation ID",
    };
    const len = c.match(/^(.*)_(CharLength|ByteLength)$/);
    const field = len ? len[1] : c;
    const bp = field.match(/^DetailedBulletPoint_(\d)$/);
    const name = bp ? `Bullet Point ${bp[1]}` : (base[field] ?? field);
    return len ? `${name} ${len[2] === "ByteLength" ? "Bytes" : "Length"}` : name;
  }

  // S6.8 full table: everything before Title stacked in the first column, one item per line
  const IDENTITY_COLS = ["ASIN","URL","VariationID","VariationProduct","ParentageLevel","VariationThemeName","Flavor","Style","Color","Size"];
  // …and each content group stacked in one column with its lengths: label | text | length
  const STACK_GROUPS: Record<string, string[]> = {
    TitleGroup: ["Title","ItemHighlight"], BulletsGroup: BULLET_COLS,
    DescGroup: ["ProductDescription"], BackendGroup: ["BackendSearchTerms"],
  };
  const STACK_LABEL: Record<string, string> = { Title: "Title", ItemHighlight: "Highlight" };
  const STACKED_FIELDS = new Set(Object.values(STACK_GROUPS).flat());
  function renderIdentityCell(r: OutSeoRow) {
    const asin = String(r.ASIN ?? "");
    const a = asins.find((x: any) => x.asin === asin);
    const meta = listingMeta[`${asin}::${String(a?.sku ?? "")}`] ?? listingMeta[asin];
    const level = String(r.ParentageLevel || "").toLowerCase();
    const badge = level === "parent" ? "Parent" : level === "child" ? "Child" : "Standalone";
    const line = (label: string, value: unknown) => {
      const v = String(value ?? "").trim();
      return v ? <div key={label} className="text-[10px]"><span className="text-muted-foreground/60">{label} </span><span className="text-foreground/80">{v}</span></div> : null;
    };
    const url = String(r.URL ?? "").trim();
    return (
      <div className="space-y-0.5 leading-tight min-w-[160px]">
        {meta?.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.thumbnailUrl} alt="" loading="lazy" className="mb-1 w-[70%] aspect-square rounded-md border border-border bg-white object-contain" />
        )}
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-xs font-bold text-brand"><AsinLink asin={asin} productId={meta?.productId} from="seo-project" /></span>
          <AmazonPdpLink asin={asin} />
        </div>
        {url && <div className="text-[10px]"><a href={url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground underline hover:text-foreground">URL</a></div>}
        {line("Variation ID", r.VariationID)}
        {line("Variation", r.VariationProduct)}
        <div className="pt-0.5"><span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${PARENTAGE_STYLES[badge.toLowerCase()] ?? "bg-muted text-muted-foreground"}`}>{badge}</span></div>
        {line("Theme", r.VariationThemeName)}
        {["Flavor","Style","Color","Size"].map((k) => line(k, r[k]))}
      </div>
    );
  }

  // One-line product identity for card headers (e.g. S6.7 Q&A): ASIN link, Amazon icon, summarized title
  function renderProductInline(asin: string) {
    const r = rows.find((x) => x.ASIN === asin);
    const a = asins.find((x: any) => x.asin === asin);
    const sku = String(a?.sku ?? "");
    const meta = listingMeta[`${asin}::${sku}`] ?? listingMeta[asin];
    const summary = meta?.summarizedTitle ?? String(r?.VariationProduct || "");
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] font-bold text-brand"><AsinLink asin={asin} productId={meta?.productId} from="seo-project" /></span>
        <AmazonPdpLink asin={asin} />
        <SummarizedTitle title={summary} layout="inline" className="min-w-0 text-[11px]" />
      </span>
    );
  }

  function renderTable(cols: string[], fit = false, vertical = false) {
    // Only show variation attribute columns that have actual data across rows
    const VARIATION_ATTRS = new Set(["Flavor","Style","Color","Size"]);
    const activeCols = cols.filter(c => {
      if (!VARIATION_ATTRS.has(c)) return true;
      // Include only if at least one non-parent row has a value for this col
      return rows.some(r => String(r.ParentageLevel||"").toLowerCase()!=="parent" && String(r[c]||"").trim());
    });
    const sortedRows = rows.toSorted((a,b)=>{
      const aP = String(a.ParentageLevel||"").toLowerCase()==="parent";
      const bP = String(b.ParentageLevel||"").toLowerCase()==="parent";
      if(aP&&!bP) return -1; if(!aP&&bP) return 1;
      return String(a.ASIN||"").localeCompare(String(b.ASIN||""));
    });
    // One table cell — shared by the wide layout and the vertical (stacked bullets) layout
    const renderCell = (r: OutSeoRow, c: string) => {
                    const v = String(r[c]??"");
                    const isLen = c.includes("CharLength")||c.includes("ByteLength");
                    const isContent = CONTENT_COLS.has(c);
                    if (c==="Product") return <td key={c} className="py-2 px-3 align-top">{renderProductCell(r)}</td>;
                    if (c==="Identity") return <td key={c} className="py-2 px-3 align-top">{renderIdentityCell(r)}</td>;
                    // S6.8: several fields stacked in one column — label | text (editable, highlighted) | length
                    if (STACK_GROUPS[c]) {
                      const fields = STACK_GROUPS[c];
                      return (
                        <td key={c} className="p-0 align-top min-w-[420px]">
                          <table className="w-full border-collapse"><tbody>
                            {fields.map(f => (
                              <tr key={f} className="align-top border-b border-surface-4/30 last:border-0">
                                {/* Label only when the column stacks several fields (one field = the header says it) */}
                                {fields.length > 1 && <td className="py-2 pl-3 pr-1 w-14 font-mono text-[10px] font-bold text-muted-foreground">{STACK_LABEL[f] ?? f.replace("DetailedBulletPoint_","BP")}</td>}
                                {renderCell(r, f)}
                                {renderCell(r, f === "BackendSearchTerms" ? `${f}_ByteLength` : `${f}_CharLength`)}
                              </tr>
                            ))}
                          </tbody></table>
                        </td>
                      );
                    }
                    const isParentage = c==="ParentageLevel";
                    const isParent = v.toLowerCase()==="parent";
                    if (isParentage) return (
                      <td key={c} className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${isParent?"bg-blue-500/15 text-blue-400 border-blue-500/20":"bg-purple-500/10 text-purple-400 border-purple-500/15"}`}>
                          {isParent?"PARENT":"CHILD"}
                        </span>
                      </td>
                    );
                    if (isLen && fit) {
                      // Fitted tables: one narrow column per text field holding its lock (top) and count (below)
                      const base = c.replace(/_(Char|Byte)Length$/, "");
                      const lockKey = `${r.ASIN}::${base}`;
                      const locked = lockedCells.has(lockKey);
                      const cap = FIELD_MAX[c];
                      const n = Number(v) || String(r[base] ?? "").length;
                      const over = cap !== undefined && n > cap;
                      return (
                        <td key={c} className="py-2 px-1 align-top text-center">
                          <button
                            onClick={()=>setLockedCells(prev=>{const s2=new Set(prev);if(s2.has(lockKey))s2.delete(lockKey);else s2.add(lockKey);return s2;})}
                            className={`inline-flex items-center justify-center rounded-full p-1 transition-opacity ${locked ? "opacity-90 hover:opacity-100" : "opacity-50 hover:opacity-100"}`}
                            title={locked ? "Unlock — allow regeneration" : "Lock — protect from regeneration"}
                            aria-label={locked ? "Unlock cell" : "Lock cell"}
                          >
                            {locked ? (
                              <svg className="size-3 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                            ) : (
                              <svg className="size-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                            )}
                          </button>
                          <div className={`font-mono text-[10px] leading-tight mt-1 ${over ? "text-red-400 font-semibold" : "text-emerald-400/70"}`} title={cap ? `max ${cap}` : undefined}>
                            {n}{cap !== undefined && <div className="text-[9px] text-muted-foreground/70 font-normal">/ {cap}</div>}
                          </div>
                        </td>
                      );
                    }
                    if (isLen) {
                      const cap = FIELD_MAX[c];
                      const n = Number(v) || 0;
                      const over = cap !== undefined && n > cap;
                      return (
                        <td key={c} className={`p-2 font-mono text-center whitespace-nowrap w-14 max-w-[56px] ${over ? "text-red-400 font-semibold" : "text-emerald-400/70"}`} title={cap ? `max ${cap}` : undefined}>{v}</td>
                      );
                    }
                    const cellKey = `${r.ASIN}::${c}`;
                    const isEditing = editingCell === cellKey;
                    if (isContent && isEditing) return (
                      <td key={c} className={`py-1 px-2 align-top ${fit ? "" : "min-w-[280px]"}`}>
                        <textarea
                          autoFocus
                          value={editingValue}
                          onChange={e=>setEditingValue(e.target.value)}
                          onKeyDown={e=>{
                            if(e.key==="Escape"){setEditingCell(null);setEditingValue("");}
                          }}
                          rows={Math.max(3,Math.ceil(editingValue.length/60))}
                          className="w-full rounded-[18px] border border-brand-500/50 bg-surface-0 px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:border-brand-500 resize-y leading-relaxed"
                          style={{minHeight:"80px"}}
                        />
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            onClick={()=>{
                              const asin = String(r.ASIN);
                              const nextRows = rows.map(row => {
                                if (row.ASIN !== asin) return row;
                                const updated = {...row,[c]:editingValue};
                                // Keep char/byte counts in sync
                                if (`${c}_CharLength` in row) (updated as any)[`${c}_CharLength`] = editingValue.length;
                                if (`${c}_ByteLength` in row) (updated as any)[`${c}_ByteLength`] = new TextEncoder().encode(editingValue).length;
                                return updated;
                              });
                              setRows(nextRows);
                              setEditingCell(null); setEditingValue("");
                              // A changed bullet re-scores itself (Human Score is computed from the text) — just save it.
                              if (/^DetailedBulletPoint_[1-5]$/.test(c) && editingValue !== String(r[c] ?? "")) {
                                void autoSave(nextRows, batches, "batch-bullets", lockedCells);
                              }
                            }}
                            disabled={/^DetailedBulletPoint_[1-5]$/.test(c) && editingValue.trim().length > BULLET_MAX}
                            className="inline-flex h-9 items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                          >✓ Confirm</button>
                          <button
                            onClick={()=>{setEditingCell(null);setEditingValue("");}}
                            className="inline-flex h-9 items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] text-muted-foreground hover:text-foreground/80 border border-surface-4"
                          >✕ Cancel</button>
                          {/^DetailedBulletPoint_[1-5]$/.test(c) && editingValue.trim().length > BULLET_MAX
                            ? <span className="text-[9px] font-bold text-red-500 ml-auto">{editingValue.trim().length}/{BULLET_MAX} — shorten to save</span>
                            : <span className="text-[9px] text-muted-foreground/60 ml-auto">{editingValue.length}c</span>}
                        </div>
                      </td>
                    );
                    const isLocked = isContent && lockedCells.has(cellKey);
                    return (
                      <td key={c}
                        className={`py-2 ${isContent ? "pl-7 pr-3" : "px-3"} ${c==="ASIN"?"font-mono text-muted-foreground whitespace-nowrap":"text-foreground/80"} ${isContent?`${fit ? "text-left" : "min-w-[280px] text-justify"} group/cell relative`:""} ${isContent && !isLocked?"cursor-pointer hover:bg-amber-500/5":""} ${isLocked?"bg-surface-2/20":""}`}
                        style={isContent?{whiteSpace:"pre-wrap",wordBreak:"break-word",textAlign:fit?"left":"justify"}:{}}
                        onClick={isContent && !isLocked?()=>{setEditingCell(cellKey);setEditingValue(v);}:undefined}
                        title={isContent?(isLocked?"Locked — click lock to unlock":"Click to edit"):""}
                      >
                        {isContent ? (
                          <>
                            {highlightKeywords(v, kwMap, restrictedSet)}
                            {/* Lock/unlock toggle (fitted tables have their own lock column) */}
                            {!fit && <button
                              onClick={(e)=>{e.stopPropagation();setLockedCells(prev=>{const n=new Set(prev);if(n.has(cellKey))n.delete(cellKey);else n.add(cellKey);return n;});}}
                              className={`inline-flex size-5 items-center justify-center absolute top-2 left-1.5 rounded-full transition-opacity ${isLocked?"opacity-70 hover:opacity-100":"opacity-0 group-hover/cell:opacity-60 hover:!opacity-100"}`}
                              title={isLocked?"Unlock — allow regeneration":"Lock — protect from regeneration"}
                            >
                              {isLocked ? (
                                <svg className="size-3 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                              ) : (
                                <svg className="size-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                              )}
                            </button>}
                            {/* Edit pencil — only when unlocked */}
                            {!isLocked && (
                              <span className="absolute top-1.5 right-1.5 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <svg className="size-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
                              </span>
                            )}
                          </>
                        ) : v}
                      </td>
                    );
    };

    // Stacked layout (S6.3 bullets): one row per text field, product cell spanning them
    if (vertical) {
      const textCols = activeCols.filter(c => CONTENT_COLS.has(c));
      return (
        <div className="rounded-[18px] border border-surface-4 bg-surface-1 overflow-hidden">
          <div className="overflow-x-auto max-h-[720px] overflow-y-auto" style={{scrollbarWidth:"thin"}}>
            <table className="w-full text-[11px] border-collapse table-fixed">
              <colgroup><col style={{ width: "10rem" }} /><col style={{ width: "3rem" }} /><col /><col style={{ width: "3.5rem" }} /></colgroup>
              <thead>
                <tr className="border-b border-surface-4 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-medium">Product</th>
                  <th className="py-2 px-1 text-left font-medium" />
                  <th className="py-2 px-3 text-left font-medium">Bullet</th>
                  <th className="py-2 px-1 text-[9px] text-center font-medium">Chars</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, ri) => textCols.map((c, ci) => (
                  <tr key={`${ri}-${c}`} className={`align-top hover:bg-surface-2/20 ${ci === textCols.length - 1 ? "border-b border-surface-4" : "border-b border-surface-4/30"}`}>
                    {ci === 0 && <td rowSpan={textCols.length} className="py-2 px-3 align-top border-r border-surface-4/50">{renderProductCell(r)}</td>}
                    <td className="py-2 px-1 align-top font-mono text-[10px] font-bold text-muted-foreground">{c.replace("DetailedBulletPoint_", "BP")}</td>
                    {renderCell(r, c)}
                    {activeCols.includes(`${c}_CharLength`) && renderCell(r, `${c}_CharLength`)}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-[18px] border border-surface-4 bg-surface-1 overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto" style={{scrollbarWidth:"thin"}}>
          {/* Fitted tables with many text columns (bullets) keep each text column ≥180px and scroll sideways */}
          <table className={`w-full text-[11px] border-collapse ${fit ? "table-fixed" : ""} [&>thead>tr>th]:border-l [&>tbody>tr>td]:border-l [&>thead>tr>th]:border-l-foreground/15 [&>tbody>tr>td]:border-l-foreground/15 [&>thead>tr>th:first-child]:border-l-0 [&>tbody>tr>td:first-child]:border-l-0`}
            style={fit && activeCols.filter(c => CONTENT_COLS.has(c)).length > 2 ? { minWidth: `${160 + activeCols.filter(c => CONTENT_COLS.has(c)).length * 180 + activeCols.filter(c => c.endsWith("_CharLength") || c.endsWith("_ByteLength")).length * 48}px` } : undefined}>
            {fit && (
              <colgroup>
                {activeCols.map(c => {
                  const isLen = c.includes("CharLength")||c.includes("ByteLength");
                  const w = isLen ? "3rem" : c==="Product" ? "10rem" : c==="ASIN" ? "6.5rem" : c==="ParentageLevel" ? "4.5rem" : CONTENT_COLS.has(c) ? undefined : "6rem";
                  return <col key={c} style={w ? { width: w } : undefined} />;
                })}
              </colgroup>
            )}
            <thead>
              <tr className="border-b border-surface-4 text-muted-foreground">
                {activeCols.map(c=>{
                  const isLen = c.includes("CharLength")||c.includes("ByteLength");
                  const shortName = fullColumnName(c);
                  const label = fit && isLen ? (c.includes("ByteLength") ? "Bytes" : "Chars") : shortName;
                  return <th key={c} className={`py-2 ${isLen && fit ? "px-1 text-[9px] whitespace-nowrap" : "px-3"} text-left font-medium ${fit && !isLen ? "break-words" : "whitespace-nowrap"} ${isLen?"w-16 text-center":""}`}>{label}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r,ri)=>(
                <tr key={ri} className={`border-b border-surface-4/50 hover:bg-surface-2/20 align-top ${String(r.ParentageLevel||"").toLowerCase()==="parent"?"bg-blue-500/5":""}`}>
                  {activeCols.map(c=>renderCell(r, c))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // KEYWORD USAGE PANEL — one table: Helium 10 keywords + SQP queries
  // ═══════════════════════════════════════════════════════════
  function renderKeywordUsage(bk: BatchKey) {
    const contentCols = getBatchContentCols(bk);
    const batchLabel = BATCHES.find(b=>b.key===bk)?.label ?? "";
    // SQP covers the whole variation's searches, so it is shown for every batch
    const showSqp = !!sqp?.available;
    // Every table shows the other steps' usage in one order (Title · Item Highlight · Bullets · Description ·
    // Backend); computed live from rows, so generating a later step updates these columns everywhere
    const priorCols = priorUsageCols(bk);
    const sqpWeeks = Number(sqp?.window?.weeks) || 8;
    // Top 50 SQP queries (already ranked by purchases) — the long tail is noise here
    const SQP_LIMIT = 50;
    const merged = mergeKeywordSources(allKws, showSqp ? (sqp.titleQueries ?? []).slice(0, SQP_LIMIT) : [], sqpWeeks);

    const colLabel = (col: string): string => {
      if (col === "Title") return "Title";
      if (col === "ItemHighlight") return "Item Highlight";
      if (col === "Bullets") return "Bullets";
      if (col === "ProductDescription") return "Desc";
      const bulletTypes: Record<string,string> = {Detailed:"BP"};
      for (const [type, short] of Object.entries(bulletTypes)) {
        // eslint-disable-next-line react-doctor/js-hoist-regexp
        const match = col.match(new RegExp(`^${type}BulletPoint_(\\d)$`));
        if (match) return `${short}${match[1]}`;
      }
      if (col === "BackendSearchTerms") return "Backend";
      return col.substring(0,8);
    };

    const withUse = merged.map(kw => {
      const inCol = contentCols.map(col =>
        rows.some(r => String(r[col]||"").toLowerCase().includes(kw.key))
      );
      const inPrior = priorCols.map(col => usedInPrior(rows as Array<Record<string, unknown>>, col, kw.key));
      return { ...kw, inCol, inPrior, used: inCol.some(Boolean) };
    });
    const usedCount = withUse.filter(k => k.used).length;
    const unusedCount = withUse.length - usedCount;

    // Sorting — click a header: first direction → other direction → back to default order.
    // Empty values ("—") always sort last.
    const sort = kwSort[bk];
    const sortVal = (k: (typeof withUse)[number], key: string): number | string | null => {
      if (key.startsWith("col:")) return k.inCol[Number(key.slice(4))] ? 1 : 0;
      if (key.startsWith("prior:")) return k.inPrior[Number(key.slice(6))] ? 1 : 0;
      switch (key) {
        // First column: in this step's text now (not the pending ticks, so rows don't jump while ticking)
        case "used": return k.used ? 1 : 0;
        case "keyword": return k.text;
        case "tier": return k.tier;
        case "sqp": return k.sqpVolumeMonthly;
        case "h10": return k.h10Volume;
        case "purchases": return k.purchases;
        case "purchaseShare": return k.purchaseShare;
        case "cartShare": return k.cartShare;
        case "clickShare": return k.clickShare;
        case "impressionShare": return k.impressionShare;
        default: return null;
      }
    };
    if (sort) {
      withUse.sort((a, b) => {
        const va = sortVal(a, sort.key), vb = sortVal(b, sort.key);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
        return sort.dir === "asc" ? c : -c;
      });
    }
    // Text and tier start A→Z / T1 first; numbers and ticks start highest first
    const cycleSort = (key: string) => setKwSort(p => {
      const first: "asc" | "desc" = key === "keyword" || key === "tier" ? "asc" : "desc";
      const cur = p[bk];
      if (!cur || cur.key !== key) return { ...p, [bk]: { key, dir: first } };
      if (cur.dir === first) return { ...p, [bk]: { key, dir: first === "asc" ? "desc" : "asc" } };
      return { ...p, [bk]: undefined };
    });
    const sortBtn = (key: string, label: React.ReactNode) => {
      const active = sort?.key === key;
      const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
      return (
        <button type="button" onClick={() => cycleSort(key)}
          className={`inline-flex items-center gap-0.5 hover:text-foreground ${active ? "text-foreground" : ""}`}
          title={active ? (sort!.dir === "asc" ? "Sorted ascending — click to reverse" : "Sorted descending — click to reverse") + " (third click resets)" : "Click to sort"}>
          {label}<Icon className={`size-3 shrink-0 ${active ? "" : "opacity-40"}`} aria-hidden="true"/>
        </button>
      );
    };

    // Every used row, plus the top 20 unused unless "Show all" is on
    const showAll = !!showAllKw[bk];
    let unusedSeen = 0;
    const visible = withUse.filter(k => k.used || showAll || unusedSeen++ < 20);

    const isChecked = (k: { key: string; used: boolean }) => k.used ? selectedUsed.has(k.key) : selectedUnused.has(k.key);
    const toggle = (k: { key: string; used: boolean }) => (k.used ? setSelectedUsed : setSelectedUnused)(prev => {
      const n = new Set(prev); n.has(k.key) ? n.delete(k.key) : n.add(k.key); return n;
    });
    // First column = "in this step's text after your changes" (ticked = used)
    const isTicked = (k: { key: string; used: boolean }) => willBeUsed(k.used, isChecked(k));
    const allVisibleChecked = visible.length > 0 && visible.every(isTicked);
    const toggleAllVisible = () => {
      const p = pendingForAll(visible, !allVisibleChecked);
      setSelectedUsed(prev => { const n = new Set(prev); p.remove.forEach(k => n.add(k)); p.clearRemove.forEach(k => n.delete(k)); return n; });
      setSelectedUnused(prev => { const n = new Set(prev); p.add.forEach(k => n.add(k)); p.clearAdd.forEach(k => n.delete(k)); return n; });
    };
    const clearSelection = () => { setSelectedUsed(new Set()); setSelectedUnused(new Set()); };
    const fmtVol = (v: number | null) => v == null ? "—" : v.toLocaleString();
    const fmtPct = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}%`;
    const th = "py-1 px-2 font-medium";

    return (
      <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-4 mt-3 space-y-3">
        <div className="flex items-center gap-3 text-[10px]">
          <h3 className="text-xs font-bold text-foreground/80 flex-1">
            Keywords{showSqp ? " & search queries" : ""} — {batchLabel}
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold">{usedCount} used</span>
          <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">{unusedCount} not used</span>
          <span className="text-muted-foreground/60">of {withUse.length}</span>
        </div>

        {/* ── How to read / use it ── */}
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <div>
            <span className="text-emerald-400 font-semibold">Green row</span> = already in the {batchLabel} text ·{" "}
            <span className="text-red-400 font-semibold">Red row</span> = not used yet.
            Ticked = in the text. Tick a red row to <b>add</b> it, untick a green row to <b>remove</b> it, then click Regenerate.
          </div>
          {showSqp && (
            <div>
              <b>Monthly searches:</b> <b>SQP</b> = Amazon Search Query Performance (top {SQP_LIMIT} queries), last {sqpWeeks} weeks converted to a monthly figure (hover for the {sqpWeeks}-week total) · <b>H10</b> = Helium 10 monthly estimate · Purchases, add to cart, clicks and impressions are this variation&apos;s, same {sqpWeeks} weeks; Share = this variation&apos;s share of all of them for that search.
            </div>
          )}
          {sqp && !sqp.available && (
            <div>No SQP data for this account{sqp.reason ? ` (${sqp.reason})` : ""} — only Helium 10 volume is shown.</div>
          )}
        </div>

        {(selectedUsed.size > 0 || selectedUnused.size > 0) && (
          <div className="flex items-center gap-2 text-[10px]">
            {selectedUnused.size > 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">+ {selectedUnused.size} to add</span>}
            {selectedUsed.size > 0 && <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">− {selectedUsed.size} to remove</span>}
            <button onClick={clearSelection} className="text-muted-foreground/70 hover:text-foreground underline underline-offset-2">Clear selection</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[10px] [&_th]:border-l [&_td]:border-l [&_th]:border-l-foreground/15 [&_td]:border-l-foreground/15 [&_tbody_tr>*:first-child]:border-l-0 [&_thead_tr:first-child>*:first-child]:border-l-0 [&_thead_tr:first-child>th:not([rowspan])]:border-b [&_thead_tr:first-child>th:not([rowspan])]:border-b-foreground/15">
            <thead>
              {/* Two header rows: labels on line 1; line 2 splits Monthly searches (SQP | H10), Purchases (Total | %) and the % shares */}
              <tr className="text-muted-foreground/70 text-left">
                <th rowSpan={2} className="py-1 px-2 align-top border-b border-surface-4">
                  <span className="inline-flex items-center gap-1">
                    <input type="checkbox" aria-label="Select all shown" title={allVisibleChecked ? "Untick all shown" : "Tick all shown"}
                      className="size-3.5 rounded border-border bg-muted accent-brand cursor-pointer"
                      checked={allVisibleChecked} onChange={toggleAllVisible}/>
                    {sortBtn("used", <span className="sr-only">Sort by used in this step</span>)}
                  </span>
                </th>
                <th rowSpan={2} className={`${th} align-top border-b border-surface-4 min-w-[180px]`}>{sortBtn("keyword", "Keyword")}</th>
                <th rowSpan={2} className={`${th} align-top border-b border-surface-4`}>{sortBtn("tier", "Tier")}</th>
                {priorCols.map(col => (
                  <th key={`prior-${col}`} className={`${th} text-center`}>{colLabel(col)}</th>
                ))}
                <th colSpan={showSqp ? 2 : 1} className={`${th} text-center`}>Monthly searches</th>
                {showSqp && <>
                  <th colSpan={2} className={`${th} text-center`}>Purchases</th>
                  <th className={`${th} text-right`}>Add to Cart</th>
                  <th className={`${th} text-right`}>Clicks</th>
                  <th className={`${th} text-right`}>Impressions</th>
                </>}
              </tr>
              <tr className="text-muted-foreground/70">
                {priorCols.map((col, pi) => (
                  <th key={`prior-${col}`} className={`${th} text-center border-b border-surface-4`} title={`Ticked = this keyword is already in the ${colLabel(col)}`}>{sortBtn(`prior:${pi}`, "Used")}</th>
                ))}
                {showSqp && <th className={`${th} text-right border-b border-surface-4`} title={`Amazon Search Query Performance: searches over the last ${sqpWeeks} weeks, converted to a monthly figure`}>{sortBtn("sqp", <span className="inline-block px-1.5 py-0.5 rounded-full border border-border text-[9px] font-bold text-foreground/80">SQP</span>)}</th>}
                <th className={`${th} text-right border-b border-surface-4`} title="Helium 10 estimated monthly search volume">{sortBtn("h10", <span className="inline-block px-1.5 py-0.5 rounded-full border border-border text-[9px] font-bold text-foreground/80">H10</span>)}</th>
                {showSqp && <>
                  <th className={`${th} text-right border-b border-surface-4`} title={`Purchases of this variation from this search, last ${sqpWeeks} weeks`}>{sortBtn("purchases", "Total")}</th>
                  <th className={`${th} text-right border-b border-surface-4`} title="Purchase share: this variation's purchases ÷ all purchases for the search">{sortBtn("purchaseShare", "Share")}</th>
                  <th className={`${th} text-right border-b border-surface-4`} title="Add-to-cart share">{sortBtn("cartShare", "Share")}</th>
                  <th className={`${th} text-right border-b border-surface-4`} title="Click share">{sortBtn("clickShare", "Share")}</th>
                  <th className={`${th} text-right border-b border-surface-4`} title="Impression share">{sortBtn("impressionShare", "Share")}</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {visible.map(k => {
                const checked = isChecked(k);
                return (
                  <tr key={k.key} onClick={()=>toggle(k)}
                    className={`border-t border-border/40 cursor-pointer ${k.used ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"} ${checked ? "ring-1 ring-inset ring-foreground/30" : ""}`}>
                    <td className="py-1 px-2">
                      <input type="checkbox" aria-label={isTicked(k) ? `Untick to remove ${k.text}` : `Tick to add ${k.text}`}
                        className="size-3.5 rounded border-border bg-muted cursor-pointer accent-emerald-500"
                        checked={isTicked(k)} onChange={()=>toggle(k)} onClick={e=>e.stopPropagation()}/>
                    </td>
                    <td className="py-1 px-2 font-medium min-w-[180px]">
                      {k.text}
                      {checked && (
                        <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${k.used ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                          {k.used ? "will remove" : "will add"}
                        </span>
                      )}
                    </td>
                    <td className="py-1 px-2">{k.tier != null ? `T${k.tier}` : "—"}</td>
                    {k.inPrior.map((on, pi) => (
                      <td key={`prior-${priorCols[pi]}`} className="py-1 px-2 text-center">
                        <input type="checkbox" checked={on} readOnly tabIndex={-1} aria-label={`${on ? "In" : "Not in"} ${colLabel(priorCols[pi])}`}
                          className={`size-3.5 rounded pointer-events-none ${on ? "accent-emerald-500" : "opacity-40"}`}/>
                      </td>
                    ))}
                    {showSqp && <td className="py-1 px-2 text-right font-mono" title={k.sqpVolume8wk != null ? `${k.sqpVolume8wk.toLocaleString()} searches in ${sqpWeeks} weeks` : undefined}>{fmtVol(k.sqpVolumeMonthly)}</td>}
                    <td className="py-1 px-2 text-right font-mono">{fmtVol(k.h10Volume)}</td>
                    {showSqp && <>
                      <td className="py-1 px-2 text-right font-semibold">{k.purchases ?? "—"}</td>
                      <td className="py-1 px-2 text-right">{fmtPct(k.purchaseShare)}</td>
                      <td className="py-1 px-2 text-right">{fmtPct(k.cartShare)}</td>
                      <td className="py-1 px-2 text-right">{fmtPct(k.clickShare)}</td>
                      <td className="py-1 px-2 text-right">{fmtPct(k.impressionShare)}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {unusedCount > 20 && (
          <button onClick={()=>setShowAllKw(p=>({...p,[bk]:!showAll}))}
            className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">
            {showAll ? "Show only the top 20 not used" : `Show all ${unusedCount} not used`}
          </button>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VALIDATION BADGES
  // ═══════════════════════════════════════════════════════════
  function renderValidation(bk: BatchKey) {
    if (bk==="titles") return (
      <div className="flex flex-col gap-1 mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] uppercase font-bold text-muted-foreground w-28 shrink-0">Title ≤75</span>
          {rows.map(r=>{const len=Number(r.Title_CharLength)||String(r.Title||"").length;const ok=len>=1&&len<=75;
          return <span key={String(r.ASIN)} className={`px-2 py-0.5 rounded-full text-[9px] font-mono ${ok?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{String(r.ASIN).substring(0,10)} {len}c {ok?"✓":"✗"}</span>;})}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] uppercase font-bold text-muted-foreground w-28 shrink-0">Item Highlight ≤125</span>
          {rows.map(r=>{const len=Number(r.ItemHighlight_CharLength)||String(r.ItemHighlight||"").length;const ok=len>=1&&len<=125;
          return <span key={String(r.ASIN)} className={`px-2 py-0.5 rounded-full text-[9px] font-mono ${ok?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{String(r.ASIN).substring(0,10)} {len}c {ok?"✓":"✗"}</span>;})}
        </div>
      </div>
    );
    if (bk==="bullets") return (
      <div className="mt-2">
        <div className="text-[9px] uppercase font-bold text-muted-foreground mb-1">Bullet length · {BULLET_MAX} chars max</div>
        <table className="text-[10px] font-mono [&_th]:border-l [&_td]:border-l [&_th]:border-l-foreground/15 [&_td]:border-l-foreground/15 [&_tr>*:first-child]:border-l-0">
          <thead>
            <tr className="text-muted-foreground/70 border-b border-surface-4">
              <th className="py-1 px-2 text-left font-medium">Product</th>
              {BULLET_COLS.map((c,i)=><th key={c} className="py-1 px-3 text-right font-medium">BP{i+1}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>{
              const lens=BULLET_COLS.map(c=>Number(r[`${c}_CharLength`])||String(r[c]||"").length);
              const empty=lens.every(l=>l===0); // e.g. a parent row with no bullets — not an error
              return (
                <tr key={String(r.ASIN)} className="border-t border-border/40">
                  <td className="py-1 px-2 font-sans">{renderProductCell(r)}</td>
                  {lens.map((len,i)=>{
                    const ok=len>=11&&len<=BULLET_MAX;
                    return <td key={i} className={`py-1 px-3 text-right ${empty?"text-muted-foreground":ok?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{empty?"—":`${len}c`}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    if (bk==="description") return (
      <div className="flex flex-wrap gap-2 mt-2">
        {rows.map(r=>{const len=Number(r.ProductDescription_CharLength)||String(r.ProductDescription||"").length;const ok=len>=1000&&len<=1200;
        return <span key={String(r.ASIN)} className={`px-2 py-0.5 rounded-full text-[9px] font-mono ${ok?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{String(r.ASIN).substring(0,10)} {len}c {ok?"✓":"✗"}</span>;})}
      </div>
    );
    if (bk==="backend") return (
      <div className="flex flex-wrap gap-2 mt-2">
        {rows.map(r=>{const b=Number(r.BackendSearchTerms_ByteLength)||new TextEncoder().encode(String(r.BackendSearchTerms||"")).length;const ok=b>0&&b<=249;
        return <span key={String(r.ASIN)} className={`px-2 py-0.5 rounded-full text-[9px] font-mono ${ok?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{String(r.ASIN).substring(0,10)} {b}B {ok?"✓":"✗ >249B"}</span>;})}
      </div>
    );
    return null;
  }

  return (
    <div className="w-full min-w-0">
      {/* Batch Status */}
      <div className="flex flex-wrap items-center gap-2 mb-6 px-3 py-2 rounded-[18px] border border-surface-4 bg-surface-1">
        <span className="text-[10px] text-muted-foreground font-bold uppercase mr-2">S6</span>
        {STEPS.map(s=>{
          const isBatch = s.key.startsWith("batch-");
          const cardId = isBatch ? `s6-${s.key}` : `s6-sec-${s.key}`;
          const st = isBatch ? batches[s.key.replace("batch-","") as BatchKey].status : sectionStateOf(s.key as S6SectionKey);
          const [code, ...rest] = s.label.split(" ");
          const done = st === "approved" || st === "done";
          return (
            <button type="button" key={s.key}
              onClick={()=>{
                // Open + scroll to that card without changing the step (keeps the current work in place)
                const el = document.getElementById(cardId) as HTMLDetailsElement | null;
                if (!el) return;
                el.open = true;
                requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}
              title={`Open ${s.label}`}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-[18px] text-[10px] font-bold cursor-pointer hover:brightness-125 transition ${pillClass(st === "pending" || st === "locked" ? "muted" : st)}`}>
              {code} <span className="hidden sm:inline">{rest.join(" ")}</span>{done&&" ✓"}
            </button>
          );
        })}
      </div>

      {error&&<div className="rounded-[18px] border border-red-500/30 bg-red-500/5 p-3 mb-4"><p className="text-xs text-red-400">{error}</p><button onClick={()=>setError(null)} className="text-[10px] text-red-500 underline mt-1">Dismiss</button></div>}

      {/* ═══════════ CONFIG ═══════════ */}
      {sectionCard("config", "S6.1 — Pre-Generation Configuration", (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            {[{l:"ASINs",v:asins.length},{l:"Keywords",v:keywords.length},{l:"COSMO",v:cosmoRows.length},{l:"Alexa for Shopping",v:rufusRows.length}].map(d=>(
              <div key={d.l} className="rounded-[18px] border border-surface-4 bg-surface-2/50 p-3"><div className="text-muted-foreground">{d.l}</div><div className="text-sm font-bold text-foreground">{d.v}</div></div>
            ))}
          </div>
          {hasSizeVariation?(
            <div className="border border-amber-500/20 rounded-[18px] p-4 bg-amber-500/5">
              <h3 className="text-xs font-bold text-amber-400 mb-2">Size Placement Lock</h3>
              <div className="space-y-2">
                {[{value:"end",label:"End of the title",ex:"Brand - Product - Feature - 16oz"},{value:"after-brand",label:"After brand name",ex:"Brand 16oz - Product - Feature"},{value:"after-descriptor",label:"After product descriptor",ex:"Brand - Product 16oz - Feature"}].map(o=>(
                  <label key={o.value} className={`flex items-start gap-3 rounded-full border p-3 cursor-pointer ${sizePlacement===o.value?"border-amber-500/50 bg-amber-500/10":"border-surface-4"}`}>
                    <input type="radio" name="sp" value={o.value} checked={sizePlacement===o.value} onChange={()=>setSizePlacement(o.value)} className="mt-0.5 accent-amber-500"/>
                    <div><div className="text-xs font-medium text-foreground">{o.label}</div><div className="text-[10px] text-muted-foreground font-mono">{o.ex}</div></div>
                  </label>
                ))}
              </div>
            </div>
          ):<div className="border border-surface-4 rounded-[18px] p-4 bg-surface-2/30"><p className="text-xs text-muted-foreground">No size variation — size placement not required.</p></div>}

          {/* Generation Guidance */}
          <div className="border border-surface-4 rounded-[18px] p-4 bg-surface-2/30">
            <div className="text-[10px] text-muted-foreground font-bold uppercase mb-1.5">Generation Guidance (Optional)</div>
            <p className="text-[10px] text-muted-foreground/60 mb-2">Provide instructions that will apply to ALL batches — tone, style, specific phrases to include/avoid, focus areas, etc.</p>
            <textarea value={configInstructions} onChange={e=>setConfigInstructions(e.target.value)}
              placeholder="e.g. 'Use a warm, conversational tone. Emphasize the organic ingredients. Avoid mentioning competitors. Focus on the premium quality angle...'"
              rows={3} className="w-full rounded-[18px] border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-foreground/80 focus:border-amber-500 focus:outline-none resize-y"/>
          </div>

          <button onClick={()=>setStep("batch-titles")} disabled={hasSizeVariation&&!sizePlacement}
            className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover disabled:opacity-40">
            {hasSizeVariation&&!sizePlacement?"Select Size Placement":"Lock Config → Generate Titles"}
          </button>
        </div>
      ))}

      {/* ═══════════ BATCH STEPS ═══════════ */}
      {/* All four content batches stacked; each generates only after the previous one is approved.
          The stack stays above audit / A+ Q&A / final so approved batches remain one click away. */}
      {BATCHES.map((batch,bi)=>{
        const bs=batches[batch.key];
        // On S6.1 the batches show as header-only cards until the config is locked
        if(!showBatchStack(step)) return stackCard(`s6-batch-${batch.key}`, `${batch.code} — ${batch.label}`, bs.status, false,
          <p className="text-xs text-muted-foreground">Finish S6.1 first.</p>);
        const prevBatch = bi > 0 ? BATCHES[bi - 1] : null;
        const prevApproved = !prevBatch || batches[prevBatch.key].status === "approved";
        const cols = batch.key==="bullets"?bulletTableCols:
          batch.key==="titles"?["Product","Title","Title_CharLength","ItemHighlight","ItemHighlight_CharLength"]:
          batch.key==="description"?["ASIN","ParentageLevel","ProductDescription","ProductDescription_CharLength"]:
          ["ASIN","ParentageLevel","BackendSearchTerms","BackendSearchTerms_ByteLength"];

        // One-click "Regenerate" — shown under the feedback field; uses the typed feedback if any
        const regenTitle = batch.key === "titles"
          ? "Regenerate all titles (≤75-char title + ≤125-char Item Highlight), using the feedback above if you typed any. Leaves bullets, description, backend, and Q&A untouched."
          : `Regenerate ${batch.label}, using the feedback above if you typed any. Leaves the other batches untouched.`;
        const regenButton = (bs.status === "review" || bs.status === "approved") ? (
          <div className="flex items-center gap-2">
            {regenConfirmKey === batch.key ? (
                    <div className="flex items-center gap-1.5 rounded-[18px] border border-brand-500/30 bg-brand-500/5 px-2.5 py-1">
                      <span className="text-[10px] text-foreground/70 mr-0.5">{revisionText.trim() ? `Re-run ${batch.label} with your feedback?` : `Re-run ${batch.label} only?`}</span>
                      <button
                        disabled={generating}
                        onClick={async () => {
                          const fb = revisionText.trim();
                          setRegenConfirmKey(null);
                          setRevisionText("");
                          setBatches(p => ({ ...p, [batch.key]: { ...p[batch.key], feedback: fb } }));
                          await generateBatch(batch.key, fb);
                        }}
                        className="inline-flex h-9 items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-40 transition-colors"
                      >Yes, regenerate</button>
                      <button
                        onClick={() => setRegenConfirmKey(null)}
                        className="inline-flex h-9 items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-surface-4 bg-surface-2 text-muted-foreground hover:text-foreground/80 transition-colors"
                      >Cancel</button>
                    </div>
                  ) : (
                    <button
                      disabled={generating}
                      onClick={() => setRegenConfirmKey(batch.key)}
                      className="inline-flex h-9 justify-center items-center gap-1 px-2.5 rounded-full text-[10px] font-bold border border-brand-500/30 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 disabled:opacity-40 transition-colors"
                      title={regenTitle}
                    >
                      <svg className="size-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                      Regenerate
                    </button>
                  )}
          </div>
        ) : null;
        return (
          <details
            key={batch.key}
            id={`s6-batch-${batch.key}`}
            open={batchCardStartsOpen(step, batch.key, bs.status)}
            className="group/batch scroll-mt-20 rounded-full open:rounded-[18px] border border-border bg-card/40"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
              {/* Collapsible batch card: the batch in progress (current step, or not yet approved) starts open */}
              <h2 className="text-sm font-bold text-foreground">{batch.code} — {batch.label}</h2>
              {lockPill(bs.status)}
              <svg className="size-4 shrink-0 text-muted-foreground transition-transform group-open/batch:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="space-y-3 border-t border-border px-4 pb-4 pt-4">
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2">
                {bs.status === "generating" ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style={{background:"linear-gradient(135deg,#c84b31,#e8602a)"}}>
                    <Loader2 className="size-3 animate-spin shrink-0" />
                    AI is generating…
                  </span>
                ) : (
                  null
                )}
              </div>
            </div>

            {/* Pass progress stepper — shown while generating */}
            {bs.status === "generating" && (
              <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-4 space-y-1.5">
                {BATCH_PASSES[batch.key].map(({pass, label, detail}) => {
                  const isDone = generatingPass > pass;
                  const isActive = generatingPass === pass;
                  return (
                    <div key={pass} className={`flex items-center gap-2.5 px-3 py-2 rounded-[18px] transition-all duration-300 ${isActive ? "bg-brand-500/10 border border-brand-500/20" : isDone ? "opacity-50" : "opacity-20"}`}>
                      {isDone ? (
                        <svg className="size-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      ) : isActive ? (
                        <Loader2 className="size-3.5 text-brand-400 animate-spin shrink-0" />
                      ) : (
                        <div className="size-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0"/>
                      )}
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className={`text-[10px] font-bold shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                        <span className="text-[9px] text-muted-foreground/50 truncate">{detail}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Generate */}
            {bs.status==="pending"&&!prevApproved&&prevBatch&&(
              <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-4 text-center text-xs text-muted-foreground">
                Approve {prevBatch.code} {prevBatch.label} first — then {batch.label} can be generated.
              </div>
            )}
            {(bs.status==="revision"||(bs.status==="pending"&&prevApproved))&&(
              <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-6 text-center">
                {bs.status==="revision"&&bs.feedback&&<div className="mb-4 rounded-[18px] border border-red-500/20 bg-red-500/5 p-3 text-left"><div className="text-[10px] text-red-400 font-bold mb-1">Revision:</div><p className="text-xs text-foreground/80">{bs.feedback}</p></div>}
                {/* Only when a listing / group / variation override is actually set (resolved from asins[0]) */}
                {(() => {
                  const groupName = (asins[0] as any)?.variation_group ?? null;
                  const tiers = [
                    (asins[0] as any)?.listing_guidelines ? "listing" : null,
                    variationGuidelines?.groups?.find(g=>g.name===((asins[0] as any)?.variation_group ?? null))?.contentGuidelines ? `group “${groupName}”` : null,
                    variationGuidelines?.defaults ? "variation defaults" : null,
                  ].filter(Boolean) as string[];
                  if (tiers.length === 0) return null;
                  return (
                <div className="mb-4 rounded-[18px] border-2 border-amber-500/40 bg-amber-500/5 p-3 text-left">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400 mb-1">⚠ Guidelines override active — {tiers.join(", ")}</div>
                  <p className="text-xs text-foreground/80 mb-1">
                    <span className="font-semibold">Listing &gt; Group &gt; Variation</span> per field. Arrays don&apos;t merge — first non-empty tier wins the whole field. Brand voice rides alongside as a separate prompt block.
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Current batch resolves from <span className="font-mono">asins[0]</span> only: group <span className="font-mono text-foreground/70">{variationGuidelines?.groups?.find(g=>g.name===((asins[0] as any)?.variation_group ?? null))?.contentGuidelines ? "✓ set" : "—"}</span>, variation defaults <span className="font-mono text-foreground/70">{variationGuidelines?.defaults ? "✓ set" : "—"}</span>, listing <span className="font-mono text-foreground/70">{(asins[0] as any)?.listing_guidelines ? "✓ set" : "—"}</span>. <a href="/docs/seo-manager-sop.html#cascade" target="_blank" rel="noreferrer" className="text-amber-600 dark:text-amber-400 underline">See cascade reference ↗</a>
                  </p>
                </div>
                  );
                })()}
                <AIGeneratingButton
                  isGenerating={generating}
                  onClick={()=>generateBatch(batch.key)}
                  label={bs.status==="revision"?`Regenerate ${batch.label}`:`Generate ${batch.label}`}
                />
              </div>
            )}

            {/* Review / Approved table */}
            {(bs.status==="review"||bs.status==="approved")&&(
              <>
                {/* Lock/Unlock All toggle for this batch */}
                {(()=>{
                  const bCols = getAllBatchContentCols(batch.key);
                  const totalCells = rows.length * bCols.length;
                  const lockedCount = rows.reduce((sum,r)=>sum+bCols.filter(c=>lockedCells.has(`${r.ASIN}::${c}`)).length,0);
                  const allLocked = lockedCount === totalCells && totalCells > 0;
                  return totalCells > 0 ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={()=>{
                          const n = new Set(lockedCells);
                          for (const r of rows) for (const c of bCols) {
                            if (allLocked) n.delete(`${r.ASIN}::${c}`);
                            else if (String(r[c]||"").trim()) n.add(`${r.ASIN}::${c}`);
                          }
                          setLockedCells(n);
                        }}
                        className={`inline-flex h-9 justify-center items-center gap-1.5 px-3 rounded-full text-[10px] font-bold border transition-colors ${allLocked?"border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20":"border-surface-4 bg-surface-2/50 text-muted-foreground hover:text-foreground/80"}`}
                      >
                        {allLocked ? (
                          <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                        ) : (
                          <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                        )}
                        {allLocked ? "Unlock All" : "Lock All"}
                      </button>
                      <span className="text-[9px] text-muted-foreground/60">{lockedCount}/{totalCells} cells locked</span>
                    </div>
                  ) : null;
                })()}

                {renderTable(cols, true, batch.key === "bullets")}
                {renderValidation(batch.key)}
                {renderKeywordUsage(batch.key)}

                {/* ── Human Score Panel (bullets only) ── */}
                {batch.key === "bullets" && (() => {
                  // Deterministic: code-scored word patterns on the current text + the frozen AI judgment rows.
                  const rowScores = rows.filter((r: any) => r._humanScore).map((r: any) => computeHumanScore(r, r._humanScore as HumanScore));
                  const displayScores = rowScores.length > 0 ? rowScores : humanScores;
                  if (displayScores.length === 0) return null;
                  return (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Human Score</span>
                      <span className="text-[9px] text-muted-foreground/50">— AI-detectability per ASIN: word patterns scored live, judgment rows from Pass 4</span>
                    </div>
                    {displayScores.map((hs: any) => {
                      const score: number = hs.score ?? 0;
                      const label: string = hs.label ?? "";
                      const isOpen = humanScoreOpen[hs.asin] ?? true;
                      const color = score >= 90 ? "emerald" : score >= 70 ? "blue" : score >= 50 ? "amber" : "red";
                      const colorMap: Record<string, string> = {
                        emerald: "border-emerald-500/30 bg-emerald-500/8 text-emerald-400",
                        blue:    "border-blue-500/30 bg-blue-500/8 text-blue-400",
                        amber:   "border-amber-500/30 bg-amber-500/8 text-amber-400",
                        red:     "border-red-500/30 bg-red-500/8 text-red-400",
                      };
                      const barColor: Record<string, string> = {
                        emerald: "bg-emerald-500",
                        blue:    "bg-blue-500",
                        amber:   "bg-amber-500",
                        red:     "bg-red-500",
                      };
                      const accepted = new Set<number>((hs.accepted ?? []).map((a: any) => a.index));
                      const superseded = supersededPaths(hs.pathTo100 ?? [], hs.accepted ?? []);
                      const bypassed = hsPathBypassed[hs.asin] ?? new Set<number>();
                      return (
                        <div key={hs.asin} className={`rounded-[18px] border text-xs ${colorMap[color]}`}>
                          {/* Header row */}
                          <button
                            className="w-full flex items-center gap-3 px-3 py-2 text-left"
                            onClick={() => setHumanScoreOpen(p => ({ ...p, [hs.asin]: !isOpen }))}
                          >
                            <span className="font-mono text-[10px] opacity-60 shrink-0">{hs.asin}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-black/20 overflow-hidden">
                              <div className={`h-full rounded-full ${barColor[color]}`} style={{ width: `${score}%` }} />
                            </div>
                            <span className="font-bold tabular-nums shrink-0">{score}%</span>
                            <span className="text-[10px] opacity-70 shrink-0">{label}</span>
                            <svg className={`size-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>
                          </button>

                          {/* Expanded details */}
                          {isOpen && (
                            <div className="px-3 pb-3 space-y-3 border-t border-current/10 pt-2">
                              {/* Detractors */}
                              {Array.isArray(hs.detractors) && hs.detractors.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-1.5">Score detractors</p>
                                  <div className="space-y-1.5">
                                    {hs.detractors.map((d: any, i: number) => (
                                      <div key={i} className="flex items-start gap-2 text-[11px]">
                                        <span className="shrink-0 font-bold tabular-nums opacity-70 mt-0.5">-{Math.abs(d.impact)}</span>
                                        <div className="min-w-0">
                                          <span className="font-semibold">{d.pattern}</span>
                                          <span className="opacity-50 ml-1 text-[9px]">{d.source}</span>
                                          <span className="opacity-50 ml-1 text-[9px]">· {d.field}</span>
                                          {d.example && (
                                            <p className="mt-0.5 opacity-60 italic">"{d.example}"</p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Path to 100 */}
                              {Array.isArray(hs.pathTo100) && hs.pathTo100.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-60">Path to 100%</p>
                                    {bypassed.size > 0 && (
                                      <span className="text-[9px] opacity-40">{bypassed.size} bypassed</span>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    {(hs.pathTo100 as Array<{ field: string; tip: string; rewrite: string }>).map((item, i: number) => {
                                      if (bypassed.has(i)) return null;
                                      const isAccepted = accepted.has(i);
                                      const isSuperseded = superseded.has(i);
                                      return (
                                        <div key={i} className={`rounded-[18px] border p-2.5 space-y-2 transition-colors ${isAccepted ? "border-emerald-500/30 bg-emerald-500/8" : "border-current/10 bg-black/10"}`}>
                                          {/* Tip + field tag + buttons */}
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                              <span className="text-[9px] font-mono opacity-50 mr-1.5">{item.field}</span>
                                              <span className="text-[11px] opacity-80 leading-relaxed">→ {item.tip}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                              <button
                                                disabled={isSuperseded}
                                                onClick={() => {
                                                  // Accept swaps the rewrite in; un-accept restores the original text. Score recomputes from the rows.
                                                  const updated = rows.map((r: any) => r.ASIN === hs.asin ? toggleAcceptedPath(r, i) : r);
                                                  setRows(updated);
                                                  void autoSave(updated, batches, "batch-bullets", lockedCells);
                                                }}
                                                className={`inline-flex h-9 items-center justify-center px-2 py-0.5 rounded-full text-[9px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${ isAccepted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-surface-3 text-muted-foreground hover:bg-surface-4" }`}
                                              >
                                                {isAccepted ? "Applied" : isSuperseded ? "Superseded" : "Accept"}
                                              </button>
                                              <button
                                                onClick={() => setHsPathBypassed(p => {
                                                  const s = new Set(p[hs.asin] ?? []);
                                                  s.add(i);
                                                  return { ...p, [hs.asin]: s };
                                                })}
                                                className="inline-flex h-9 items-center justify-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-3 text-muted-foreground/50 hover:bg-surface-4 transition-colors"
                                              >
                                                Bypass
                                              </button>
                                            </div>
                                          </div>
                                          {/* Rewrite preview */}
                                          {item.rewrite && (
                                            <p className={`text-[10px] leading-relaxed rounded-[18px] px-2 py-1.5 ${isAccepted ? "text-emerald-300/80 bg-emerald-500/5" : "text-foreground/50 bg-black/10"}`}>
                                              {item.rewrite}
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {hs.descriptionChecked && (
                                <p className="text-[9px] opacity-40 italic">Description alignment was checked in this score.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}

                {/* ── Inline Compliance Panel ── */}
                {batchCompliance[batch.key]?.checked && (()=>{
                  const {findings} = batchCompliance[batch.key];
                  // Group by (detail) — deduplicate same issue across columns/ASINs
                  type GroupedFinding = { detail: string; severity: string; term?: string; locations: string[]; key: string; };
                  const grouped: GroupedFinding[] = [];
                  for (const f of findings) {
                    const existing = grouped.find(g => g.detail === f.detail);
                    const loc = `${f.shortField||f.field}`;
                    if (existing) { if (!existing.locations.includes(loc)) existing.locations.push(loc); }
                    else grouped.push({ detail: f.detail, severity: f.severity, term: f.term, locations: [loc], key: f.detail });
                  }
                  const activeIssues = grouped.filter(g => !dismissedFindings.has(`${batch.key}::${g.key}`));
                  const critCount = activeIssues.filter(g=>g.severity==="critical").length;
                  const warnCount = activeIssues.filter(g=>g.severity==="warning").length;

                  if (grouped.length === 0) return (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-[18px] border border-emerald-500/20 bg-emerald-500/5 text-[11px] text-emerald-400">
                      <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      <span className="font-bold">Compliance clear</span>
                      <span className="text-emerald-400/60">— no prohibited terms, emoji, or formatting issues detected</span>
                    </div>
                  );

                  return (
                    <div className="rounded-[18px] border border-red-500/20 bg-red-500/5 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center gap-3 px-3 py-2 border-b border-red-500/15">
                        <svg className="size-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008Z"/></svg>
                        {critCount > 0 && <span className="text-[11px] font-bold text-red-400">{critCount} critical</span>}
                        {warnCount > 0 && <span className="text-[11px] font-bold text-amber-400">{warnCount} warnings</span>}
                        {activeIssues.length < grouped.length && <span className="text-[10px] text-muted-foreground">{grouped.length - activeIssues.length} bypassed</span>}
                        <span className="text-[10px] text-muted-foreground/60 ml-1">— terms highlighted in blue above · check to bypass</span>
                        {grouped.length > 0 && (
                          <button
                            onClick={()=>setDismissedFindings(p=>{const n=new Set(p);grouped.forEach(g=>n.add(`${batch.key}::${g.key}`));return n;})}
                            className="ml-auto text-[9px] text-muted-foreground/60 hover:text-muted-foreground underline"
                          >bypass all</button>
                        )}
                      </div>
                      {/* Table */}
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-red-500/10 text-muted-foreground/60 text-[9px] uppercase tracking-wide">
                            <th className="py-1.5 px-3 text-left w-8">Bypass</th>
                            <th className="py-1.5 px-3 text-left w-16">Severity</th>
                            <th className="py-1.5 px-3 text-left">Issue</th>
                            <th className="py-1.5 px-3 text-left">Locations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grouped.map((g) => {
                            const dismissed = dismissedFindings.has(`${batch.key}::${g.key}`);
                            return (
                              <tr key={g.key} className={`border-b border-red-500/10 last:border-0 ${dismissed?"opacity-40":""}`}>
                                <td className="py-2 px-3">
                                  <input type="checkbox"
                                    checked={dismissed}
                                    onChange={()=>setDismissedFindings(p=>{const n=new Set(p);dismissed?n.delete(`${batch.key}::${g.key}`):n.add(`${batch.key}::${g.key}`);return n;})}
                                    className="h-9 rounded-full border-border bg-muted accent-amber-500 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${g.severity==="critical"?"bg-red-500/20 text-red-400":"bg-amber-500/20 text-amber-400"}`}>
                                    {g.severity}
                                  </span>
                                </td>
                                <td className={`py-2 px-3 ${dismissed?"line-through":""} ${g.severity==="critical"?"text-red-300":"text-amber-300"}`}>
                                  {g.detail}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {g.locations.map(loc=>(
                                      <span key={loc} className="px-1.5 py-0.5 rounded-full bg-surface-2 border border-surface-4 font-mono text-[9px] text-muted-foreground">{loc}</span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {bs.status==="review"&&(
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={()=>downloadCSV(cols)} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">Download {batch.code} CSV</button>
                      {batch.key==="backend"&&(
                        <button onClick={refineBackend} disabled={refiningBackend}
                          className="inline-flex h-9 justify-center rounded-full border border-blue-500/40 bg-blue-500/10 px-4 text-[13px] font-bold text-blue-400 hover:bg-blue-500/20 items-center gap-2 shrink-0 disabled:opacity-50">
                          {refiningBackend
                            ? <><svg className="size-3.5 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>Refining…</>
                            : <><svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>Refine Backend Keywords</>
                          }
                        </button>
                      )}
                      {/* Keyword-selection regenerate button — amber, shown when keywords selected */}
                      {(selectedUnused.size > 0 || selectedUsed.size > 0) && (
                        <button
                          onClick={()=>{
                            const parts: string[] = [];
                            if (selectedUnused.size > 0) parts.push(`ADD these keywords: ${[...selectedUnused].join(", ")}`);
                            if (selectedUsed.size > 0) parts.push(`REMOVE these keywords: ${[...selectedUsed].join(", ")}`);
                            const instruction = parts.join(". ");
                            setSelectedUnused(new Set());
                            setSelectedUsed(new Set());
                            reviseBatch(batch.key, instruction);
                          }}
                          className="inline-flex h-9 justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover items-center gap-2 shrink-0"
                        >
                          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                          Regenerate {batch.code}
                          {selectedUnused.size > 0 && <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded-full font-bold">+{selectedUnused.size}</span>}
                          {selectedUsed.size > 0 && <span className="bg-red-500/20 text-red-300 text-[9px] px-1.5 py-0.5 rounded-full font-bold">−{selectedUsed.size}</span>}
                        </button>
                      )}
                      <button onClick={()=>approveBatch(batch.key)} className="inline-flex h-9 items-center justify-center ml-auto rounded-full bg-accent-green px-4 text-[13px] font-bold text-surface-0 hover:bg-accent-green/80 shrink-0">✓ Approve {batch.code}</button>
                    </div>
                    <div className="rounded-[18px] border border-surface-4 bg-surface-2/30 p-3">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase mb-1.5">Or provide feedback & regenerate</div>
                      <textarea value={revisionText} onChange={e=>setRevisionText(e.target.value)}
                        placeholder={`Describe changes for ${batch.label}…`}
                        rows={2} className="w-full rounded-[18px] border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-foreground/80 focus:border-amber-500 focus:outline-none resize-y"/>
                    </div>
                    {regenButton}
                  </div>
                )}
                {bs.status==="approved"&&(
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-emerald-400 font-bold">✓ {batch.code} Approved</span>
                      <button onClick={()=>downloadCSV(cols)} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-3 text-[10px] text-muted-foreground hover:bg-surface-2">Download CSV</button>
                      {batch.key==="backend"&&(
                        <button onClick={refineBackend} disabled={refiningBackend}
                          className="inline-flex h-9 justify-center rounded-full border border-blue-500/40 bg-blue-500/10 px-3 text-[13px] font-bold text-blue-400 hover:bg-blue-500/20 items-center gap-2 shrink-0 disabled:opacity-50">
                          {refiningBackend
                            ? <><svg className="size-3 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>Refining…</>
                            : <><svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>Refine Backend Keywords</>
                          }
                        </button>
                      )}
                      {(selectedUnused.size > 0 || selectedUsed.size > 0) && (
                        <button
                          onClick={()=>{
                            const parts: string[] = [];
                            if (selectedUnused.size > 0) parts.push(`ADD these keywords: ${[...selectedUnused].join(", ")}`);
                            if (selectedUsed.size > 0) parts.push(`REMOVE these keywords: ${[...selectedUsed].join(", ")}`);
                            const instruction = parts.join(". ");
                            setSelectedUnused(new Set());
                            setSelectedUsed(new Set());
                            reviseBatch(batch.key, instruction);
                          }}
                          className="inline-flex h-9 justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover items-center gap-2 shrink-0"
                        >
                          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                          Regenerate {batch.code}
                          {selectedUnused.size > 0 && <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded-full font-bold">+{selectedUnused.size}</span>}
                          {selectedUsed.size > 0 && <span className="bg-red-500/20 text-red-300 text-[9px] px-1.5 py-0.5 rounded-full font-bold">−{selectedUsed.size}</span>}
                        </button>
                      )}
                    </div>
                    <div className="rounded-[18px] border border-surface-4 bg-surface-2/30 p-3">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase mb-1.5">Provide feedback & regenerate</div>
                      <textarea value={revisionText} onChange={e=>setRevisionText(e.target.value)}
                        placeholder={`Describe changes for ${batch.label}... (e.g. "make bullet 2 more benefit-focused", "add more emotional language to title")`}
                        rows={2} className="w-full rounded-[18px] border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-foreground/80 focus:border-amber-500 focus:outline-none resize-y"/>
                    </div>
                    {regenButton}
                  </div>
                )}
              </>
            )}
            </div>
          </details>
        );
      })}

      {/* ═══════════ AUDIT & OPTIMIZE ═══════════ */}
      {sectionCard("audit", "S6.6 — Audit & Optimize", (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Premium audit scores 12 dimensions, identifies gaps, and suggests specific rewrites to improve content before lock.</p>

          {!auditResult ? (
            <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-6 text-center">
              <AIGeneratingButton
                isGenerating={auditRunning}
                onClick={runAudit}
                label="Run Premium Audit"
              />
            </div>
          ) : (
            <>
              {/* 12 Score Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {l:"Compliance",v:auditResult.complianceScore},
                  {l:"Keyword Coverage",v:auditResult.keywordCoverage},
                  {l:"COSMO Density",v:auditResult.cosmoDensity},
                  {l:"Alexa for Shopping Coverage",v:auditResult.rufusCoverage},
                  {l:"Human Voice",v:auditResult.humanVoice},
                  {l:"Buyer Journey",v:auditResult.buyerJourney},
                  {l:"Variation Consistency",v:auditResult.variationConsistency},
                  {l:"E-E-A-T",v:auditResult.eeatScore},
                  {l:"Readability",v:auditResult.readabilityScore},
                  {l:"AI Citability",v:auditResult.citabilityScore},
                  {l:"GEO Readiness",v:auditResult.geoScore},
                  {l:"Overall",v:auditResult.overallScore},
                ].map(s=>{
                  const pct = Math.round(((s.v||0)/100)*100);
                  const color = pct>=80?"emerald":pct>=60?"amber":"red";
                  return (
                    <div key={s.l} className={`rounded-[18px] border border-${color}-500/20 bg-${color}-500/5 p-3`}>
                      <div className={`text-sm font-extrabold text-${color}-400`}>{s.v ?? "—"}</div>
                      <div className="text-[9px] text-muted-foreground uppercase">{s.l}</div>
                    </div>
                  );
                })}
              </div>

              {/* Findings with Rewrite Suggestions */}
              {auditResult.findings?.length > 0 ? (
                <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground/80">Findings & Rewrite Suggestions</h3>
                    {auditResult.findings.some((f: any) => f.rewrite) && (
                      <span className="text-[9px] text-muted-foreground">
                        {acceptedRewrites.size} of {auditResult.findings.filter((f: any) => f.rewrite).length} accepted
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {auditResult.findings.map((f: any, i: number) => (
                      <div key={i} className={`rounded-[18px] border p-3 ${f.severity==="critical"?"border-red-500/20 bg-red-500/5":f.severity==="warning"?"border-amber-500/20 bg-amber-500/5":"border-surface-4 bg-surface-2/30"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${f.severity==="critical"?"bg-red-500/20 text-red-400":f.severity==="warning"?"bg-amber-500/20 text-amber-400":"bg-blue-500/20 text-blue-400"}`}>{f.severity}</span>
                          <span className="text-xs font-medium text-foreground/80">{f.category}</span>
                          {f.asin && f.asin !== "all" && <span className="text-[9px] text-muted-foreground font-mono">{f.asin}</span>}
                          {f.field && f.field !== "all" && <span className="text-[9px] text-muted-foreground">{f.field}</span>}
                          <span className="text-[9px] px-1 rounded-full bg-surface-3 text-muted-foreground/60">{f.batch}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{f.detail}</p>
                        {f.suggestion && <p className="text-[11px] text-brand-400 mt-1">→ {f.suggestion}</p>}

                        {/* Rewrite suggestion with accept/reject */}
                        {f.rewrite && (
                          <div className="mt-2 rounded-[18px] border border-surface-4 bg-surface-2/20 p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold text-emerald-400 uppercase">Suggested Rewrite</span>
                              <button
                                onClick={() => {
                                  setAcceptedRewrites(prev => {
                                    const next = new Set(prev);
                                    if (next.has(i)) next.delete(i); else next.add(i);
                                    return next;
                                  });
                                }}
                                className={`inline-flex h-9 items-center justify-center px-2.5 rounded-full text-[9px] font-bold transition-colors ${ acceptedRewrites.has(i) ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-surface-3 text-muted-foreground hover:bg-surface-4" }`}
                              >
                                {acceptedRewrites.has(i) ? "Accepted" : "Accept"}
                              </button>
                            </div>
                            <p className="text-[10px] text-foreground/70 leading-relaxed">{f.rewrite}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Regenerate with Accepted Suggestions */}
                  {acceptedRewrites.size > 0 && (
                    <div className="flex items-center gap-3 pt-2 border-t border-surface-4">
                      <button
                        onClick={regenerateWithRewrites}
                        className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-500 px-4 text-[13px] font-bold text-white hover:bg-emerald-400"
                      >
                        Regenerate with {acceptedRewrites.size} Accepted Suggestion{acceptedRewrites.size > 1 ? "s" : ""}
                      </button>
                      <button
                        onClick={() => setAcceptedRewrites(new Set())}
                        className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[18px] border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                  <p className="text-sm text-emerald-400 font-bold">No issues found — content looks great!</p>
                </div>
              )}

              {/* Auto-Polish */}
              {auditResult.remediation && (
                <div className="rounded-[18px] border border-brand/20 bg-brand/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-foreground">Auto-Polish</h3>
                      <p className="text-[10px] text-muted-foreground">Automatically regenerate failing batches with targeted audit feedback.</p>
                    </div>
                    <button
                      onClick={runPolish}
                      disabled={polishRunning}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-brand-solid px-4 text-[13px] font-bold text-white hover:bg-brand-solid-hover disabled:opacity-50 shrink-0"
                    >
                      {polishRunning ? "Polishing…" : "Polish Content"}
                    </button>
                  </div>
                  {polishLog.length > 0 && (
                    <div className="space-y-1">
                      {polishLog.map((log, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground">{log}</p>
                      ))}
                    </div>
                  )}
                  {auditResult.remediation.titles && (
                    <div className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/60">Titles:</span> {auditResult.remediation.titles}</div>
                  )}
                  {auditResult.remediation.bullets && (
                    <div className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/60">Bullets:</span> {auditResult.remediation.bullets}</div>
                  )}
                  {auditResult.remediation.description && (
                    <div className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/60">Description:</span> {auditResult.remediation.description}</div>
                  )}
                  {auditResult.remediation.backend && (
                    <div className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground/60">Backend:</span> {auditResult.remediation.backend}</div>
                  )}
                </div>
              )}

              {/* Manual feedback */}
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/30 p-4 space-y-3">
                <div className="text-[10px] text-muted-foreground font-bold uppercase">Or provide custom feedback</div>
                <textarea value={auditFeedback} onChange={e=>setAuditFeedback(e.target.value)}
                  placeholder="Describe improvements... (e.g. 'strengthen COSMO relationships in bullets 3-4', 'title needs more emotional appeal')"
                  rows={3} className="w-full rounded-[18px] border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-foreground/80 focus:border-amber-500 focus:outline-none resize-y"/>
                {auditFeedback.trim() && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Send to:</span>
                    {BATCHES.map(b=>(
                      <button key={b.key} onClick={()=>{
                        reviseBatch(b.key as BatchKey, auditFeedback);
                        setStep(`batch-${b.key}`); setAuditFeedback(""); setAuditResult(null);
                      }} className="inline-flex h-9 items-center justify-center rounded-full border border-amber-500/30 px-3 text-[10px] font-bold text-amber-400 hover:bg-amber-500/10">
                        {b.code} {b.label}
                      </button>
                    ))}
                    <button onClick={()=>setAuditFeedback("")} className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground ml-2">Cancel</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button onClick={()=>{setAuditResult(null);setAcceptedRewrites(new Set());}} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">Re-run Audit</button>
                <button onClick={()=>setStep("aplus-qa")} className="inline-flex h-9 items-center justify-center ml-auto rounded-full bg-accent-green px-4 text-[13px] font-bold text-surface-0 hover:bg-accent-green/80 shrink-0">
                  Pass Audit → A+ Q&A
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* ═══════════ PREMIUM A+ Q&A ═══════════ */}
      {sectionCard("aplus-qa", "S6.7 — Premium A+ Q&A (Module 7)", (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <span className="text-[9px] text-muted-foreground/50">5 pairs per ASIN · Q: 115-120 chars · A: 245-250 chars · Decision-stage</span>
          </div>

          {aplusQA.length === 0 ? (
            <div className="rounded-[18px] border border-surface-4 bg-surface-1 p-8 flex flex-col items-center gap-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-foreground">Generate Premium A+ Q&amp;A</p>
                <p className="text-[11px] text-muted-foreground">Claude will write 5 Decision-stage Q&amp;A pairs per ASIN, grounded in your approved bullets &amp; description.</p>
              </div>
              {qaError && <p className="text-[10px] text-red-400 max-w-xs text-center">{qaError}</p>}
              <button
                disabled={generatingQA}
                onClick={async () => {
                  setGeneratingQA(true); setQaError(null);
                  try {
                    const res = await fetch("/api/seo/claude/aplus-qa", {
                      method: "POST",
                      headers: {"Content-Type":"application/json"},
                      body: JSON.stringify({
                        projectId,
                        brandName, keywords: keywords.slice(0,30),
                        rows: rows.map((r:any) => ({
                          ASIN: r.ASIN, ParentageLevel: r.ParentageLevel,
                          Flavor: r.Flavor, Style: r.Style, Color: r.Color, Size: r.Size,
                          Title: r.Title,
                          // All five bullets + full description, so Q&A doesn't repeat or contradict the listing
                          ...Object.fromEntries(BULLET_COLS.map(c => [c, r[c]])),
                          ProductDescription: r.ProductDescription,
                        })),
                        guidelines, // full brand guidelines (was cut to 400 here and 300 in the route)
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Generation failed");
                    setAplusQA(data.pairs || []);
                  } catch(e:unknown){ setQaError(e instanceof Error ? e.message : String(e)); }
                  setGeneratingQA(false);
                }}
                className="inline-flex h-9 justify-center items-center gap-2.5 rounded-full px-4 text-[13px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                style={{background:"linear-gradient(135deg,#c84b31,#e8602a)"}}
              >
                {generatingQA ? (
                  <>
                    <Loader2 className="size-4 animate-spin shrink-0" />
                    AI is generating…
                  </>
                ) : (
                  <>
                    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
                    Generate Premium A+ Q&amp;A
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {aplusQA.map((item) => (
                <div key={item.asin} className="rounded-[18px] border border-surface-4 bg-surface-1 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-4 bg-surface-2/40">
                    {renderProductInline(item.asin)}
                    <span className="ml-3 shrink-0 text-[9px] text-muted-foreground/60">Module 7 · premium_qa · 5 pairs</span>
                  </div>
                  <div className="divide-y divide-surface-4">
                    {(item.questions || []).map((pair, pi) => {
                      const qLen = pair.qLen ?? (pair.q||"").length;
                      const aLen = pair.aLen ?? (pair.a||"").length;
                      const qOk = qLen >= 115 && qLen <= 120;
                      const aOk = aLen >= 245 && aLen <= 250;
                      return (
                        <div key={pi} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="text-[9px] font-bold text-brand-400 shrink-0 mt-0.5">Q{pi+1}</span>
                              <p className="text-[11px] text-foreground/90 leading-relaxed">{pair.q}</p>
                            </div>
                            <span className={`text-[9px] font-mono shrink-0 mt-0.5 ${qOk?"text-emerald-400":"text-red-400"}`}>{qLen}</span>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="text-[9px] font-bold text-muted-foreground shrink-0 mt-0.5">A{pi+1}</span>
                              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{pair.a}</p>
                            </div>
                            <span className={`text-[9px] font-mono shrink-0 mt-0.5 ${aOk?"text-emerald-400":"text-red-400"}`}>{aLen}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-3 pt-1">
                <button onClick={()=>setAplusQA([])} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">Regenerate</button>
                <button onClick={()=>setStep("audit")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">← Back to Audit</button>
                <button onClick={async ()=>{
                  // Inject _aplusQA into each row so autoSave persists it in generatedContent JSONB
                  if (aplusQA.length > 0) {
                    const updatedRows = rows.map((r:any) => {
                      const qa = aplusQA.find(q => q.asin === r.ASIN);
                      return qa ? { ...r, _aplusQA: qa.questions } : r;
                    });
                    setRows(updatedRows as OutSeoRow[]);
                    await autoSave(updatedRows as OutSeoRow[], batches, "aplus-qa", lockedCells);
                  }
                  setStep("final");
                }} className="inline-flex h-9 items-center justify-center ml-auto rounded-full bg-accent-green px-4 text-[13px] font-bold text-surface-0 hover:bg-accent-green/80">
                  Approve Q&amp;A → Final
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* ═══════════ FINAL ═══════════ */}
      {sectionCard("final", `S6.8 — Final SEO Content (${OUT_SEO_COLS.length} Columns)`, (
        <div className="space-y-4">
          {!allApproved?(
            <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/5 p-6 text-center"><p className="text-sm text-amber-400">Not all batches approved yet.</p></div>
          ):!isApproved?(
            <div className="space-y-4">
              {renderTable(["Identity", ...Object.keys(STACK_GROUPS), ...OUT_SEO_COLS.filter(c => !IDENTITY_COLS.includes(c) && !STACKED_FIELDS.has(c.replace(/_(CharLength|ByteLength)$/, "")))])}

              {/* Feedback before lock */}
              <div className="rounded-[18px] border border-surface-4 bg-surface-2/30 p-4 space-y-3">
                <div className="text-[10px] text-muted-foreground font-bold uppercase">Want changes? Send feedback to a batch</div>
                <textarea value={finalRevisionText} onChange={e=>setFinalRevisionText(e.target.value)}
                  placeholder="Describe what to change... (e.g. 'title 2 needs more keywords', 'bullet 5 should focus on size differences', 'backend missing supplement terms')"
                  rows={2} className="w-full rounded-[18px] border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-foreground/80 focus:border-amber-500 focus:outline-none resize-y"/>
                {finalRevisionText.trim() && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Send to:</span>
                    {BATCHES.map(b=>(
                      <button key={b.key} onClick={()=>{
                        reviseBatch(b.key as BatchKey, finalRevisionText);
                        setStep(`batch-${b.key}`); setFinalRevisionText("");
                      }} className="inline-flex h-9 items-center justify-center rounded-full border border-amber-500/30 px-3 text-[10px] font-bold text-amber-400 hover:bg-amber-500/10">
                        {b.code} {b.label}
                      </button>
                    ))}
                    <button onClick={()=>setFinalRevisionText("")} className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground ml-2">Cancel</button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button onClick={()=>downloadCSV()} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">Download SEO Content CSV</button>
                <button onClick={()=>setStep("audit")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] text-muted-foreground hover:bg-surface-2">← Back to Audit</button>
                <button onClick={saveFinal} className="inline-flex h-9 items-center justify-center rounded-full bg-accent-green px-4 text-[13px] font-bold text-surface-0 hover:bg-accent-green/80">Save & Submit for review</button>
              </div>
            </div>
          ):(
            <div className="rounded-[18px] border border-accent-green/30 bg-accent-green/5 p-6 text-center space-y-4">
              <div>
                <div className="mb-1 text-lg font-extrabold text-accent-green">S6 SEO Content — Locked ✓</div>
                <p className="text-sm text-muted-foreground">{rows.length} ASINs × {OUT_SEO_COLS.length} columns</p>
              </div>
              {/* Export to Google Drive removed for now (Manu 2026-10-02) — exportGoogleDoc kept for when it gets a new home */}
              <div className="flex items-center justify-center gap-3 pt-1 border-t border-accent-green/20">
                <button onClick={()=>downloadCSV()} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Download SEO Content CSV</button>
                {!revisionOpen && (
                  <button onClick={()=>void unlockS6()} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground/80">Unlock for Editing</button>
                )}
              </div>

            </div>
          )}
        </div>
      ))}

      {/* ═══════════ S7 REVIEW & SHARE ═══════════ */}
      {sectionCard("review", "S7 — Review & Share with Client", (
        <div className="space-y-4">
          <RevisionStrip projectId={projectId} refreshKey={revisionRefresh}
            onOpenChange={(open) => { setRevisionOpen(open); if (open) { setIsApproved(true); setStep("final"); } }}
            onCurrentChange={setApprovedRevision}
            onOpenReview={setReviewRevisionId} onLatestChange={setReviewRevisionId} onPushedChange={setPushedBefore} compact />
          {reviewRevisionId && (
            <RevisionReviewPanel key={reviewRevisionId} projectId={projectId} revisionId={reviewRevisionId} embedded
              onDecided={() => setRevisionRefresh((n) => n + 1)}
              onContentEdited={(asin, key, value) => setRows((prev) => prev.map((r) => r.ASIN !== asin ? r : {
                ...r, [key]: value,
                ...(`${key}_CharLength` in r ? { [`${key}_CharLength`]: value.length } : {}),
                ...(`${key}_ByteLength` in r ? { [`${key}_ByteLength`]: new TextEncoder().encode(value).length } : {}),
              }))} />
          )}
        </div>
      ), true)}

      {/* ═══════════ S8 PUSH CONTENT TO PRODUCTS ═══════════ */}
      {sectionCard("push", "S8 — Push Content to Products", (
              <div className="rounded-[18px] border border-neutral-200 bg-white p-5 space-y-3 text-neutral-900">
                <div className="flex items-center justify-between">
                  <div>
                    {!approvedRevision && (
                      <p className="text-[10px] text-neutral-600">Needs an approved revision — submit for review first.</p>
                    )}
                    {approvedRevision && <p className="text-[10px] text-emerald-600">Pushes approved text r{approvedRevision.revisionNumber}.</p>}
                    {!approvedRevision && hasSuperPowers(session?.user?.role) && (
                      <button type="button" onClick={pushWithoutReview} disabled={migrationRunning} className="text-[10px] font-bold text-red-500 underline disabled:opacity-50">Push without review (Owner override)</button>
                    )}
                  </div>
                  {!migrationResult && (
                    <button
                      onClick={migrationPreview ? executeMigration : previewMigration}
                      disabled={migrationRunning || !approvedRevision}
                      className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-[10px] font-bold disabled:opacity-50 ${migrationPreview ? "bg-brand text-white hover:bg-brand-hover" : "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25"}`}
                    >
                      {migrationRunning ? "Working…" : migrationPreview ? "Confirm Migration" : "Preview Migration"}
                    </button>
                  )}
                </div>
                {migrationResult ? (
                  <div className="rounded-[18px] border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold">
                      <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                      </svg>
                      Migration Complete
                    </div>
                    <div className="text-xs text-neutral-600">
                      {migrationResult.fieldsUpdated} fields updated across {migrationResult.migratedCount} products.
                      {migrationResult.unmatchedAsins?.length > 0 && (
                        <span className="text-amber-700 ml-2">{migrationResult.unmatchedAsins.length} ASINs not matched in catalog.</span>
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-500">Products marked as dirty — publish to BigQuery when ready.</p>
                  </div>
                ) : migrationPreview ? (
                  <div className="space-y-3">
                    <div className="flex gap-4 text-xs text-neutral-600">
                      {migrationPreview.revision ? <span className="font-bold text-neutral-900">Pushes r{migrationPreview.revision.revisionNumber}</span> : <span>No approved revision</span>}
                      <span>{(migrationPreview.asins || []).filter((p: any) => p.productId).length} in catalog</span>
                      {(migrationPreview.asins || []).some((p: any) => !p.productId) && <span className="text-amber-700">{(migrationPreview.asins || []).filter((p: any) => !p.productId).length} not in catalog</span>}
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {(migrationPreview.asins || []).map((p: any) => (
                        <div key={p.asin} className={`rounded-[18px] border p-3 text-[10px] ${p.productId ? "border-neutral-200 bg-neutral-50" : "border-amber-500/20 bg-amber-500/5"}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-neutral-900">{p.asin}</span>
                            {!p.productId && <span className="text-amber-700 font-bold">not in catalog</span>}
                          </div>
                          {p.productId && (
                            <div className="flex flex-wrap gap-1">
                              {p.changes.length === 0 && <span className="text-neutral-500">No changes</span>}
                              {p.changes.map((k: string) => (
                                <span key={k} className="rounded-full px-1.5 py-0.5 bg-emerald-500/10 text-emerald-700">{FIELD_LABELS[k] ?? k}</span>
                              ))}
                            </div>
                          )}
                          {(p.drift || []).map((d: { key: string; changedAt: string; changedBy: string }) => (
                            <p key={`${d.key}-${d.changedAt}`} className="mt-1 text-red-500">{FIELD_LABELS[d.key] ?? d.key} edited in the catalog on {String(d.changedAt).slice(0, 10)} by {d.changedBy}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setMigrationPreview(null)} className="text-[10px] text-neutral-500 hover:text-neutral-700 underline">Cancel</button>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    Push approved S6 content (titles, bullets, descriptions, backend terms) directly to product records.
                    Products will be marked dirty for BigQuery publishing.
                  </p>
                )}
              </div>
      ))}

      {/* Insights section removed — competitive/validation/GEO merged into S6.6 Audit & Optimize */}
    </div>
  );
}
