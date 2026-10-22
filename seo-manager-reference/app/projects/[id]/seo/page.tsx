/* eslint-disable react-doctor/no-render-in-render */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */
/* eslint-disable react-doctor/no-array-index-as-key */
/* eslint-disable react-doctor/js-set-map-lookups */
"use client";

import { useState, useCallback, useEffect, useMemo, Fragment } from "react";
import StepNav from "@/components/step-nav";
import AIGeneratingButton from "@/components/ai-generating-button";
import { useParams } from "next/navigation";

// ═══════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════
const OUT_SEO_COLS = [
  "ASIN","URL","VariationID","VariationProduct","ParentageLevel","VariationThemeName",
  "Flavor","Style","Color","Size",
  "Title","Title_CharLength",
  "DetailedBulletPoint_1","DetailedBulletPoint_1_CharLength",
  "DetailedBulletPoint_2","DetailedBulletPoint_2_CharLength",
  "DetailedBulletPoint_3","DetailedBulletPoint_3_CharLength",
  "DetailedBulletPoint_4","DetailedBulletPoint_4_CharLength",
  "DetailedBulletPoint_5","DetailedBulletPoint_5_CharLength",
  "ConciseBulletPoint_1","ConciseBulletPoint_1_CharLength",
  "ConciseBulletPoint_2","ConciseBulletPoint_2_CharLength",
  "ConciseBulletPoint_3","ConciseBulletPoint_3_CharLength",
  "ConciseBulletPoint_4","ConciseBulletPoint_4_CharLength",
  "ConciseBulletPoint_5","ConciseBulletPoint_5_CharLength",
  "ContentBulletPoint_1","ContentBulletPoint_1_CharLength",
  "ContentBulletPoint_2","ContentBulletPoint_2_CharLength",
  "ContentBulletPoint_3","ContentBulletPoint_3_CharLength",
  "ContentBulletPoint_4","ContentBulletPoint_4_CharLength",
  "ContentBulletPoint_5","ContentBulletPoint_5_CharLength",
  "KeyFeaturesBulletPoint_1","KeyFeaturesBulletPoint_1_CharLength",
  "KeyFeaturesBulletPoint_2","KeyFeaturesBulletPoint_2_CharLength",
  "KeyFeaturesBulletPoint_3","KeyFeaturesBulletPoint_3_CharLength",
  "KeyFeaturesBulletPoint_4","KeyFeaturesBulletPoint_4_CharLength",
  "KeyFeaturesBulletPoint_5","KeyFeaturesBulletPoint_5_CharLength",
  "ProductDescription","ProductDescription_CharLength",
  "SearchTermsCore","SearchTermsCore_ByteLength",
  "SearchTermsSupplement","SearchTermsSupplement_ByteLength",
  "SearchTermsSymptom","SearchTermsSymptom_ByteLength",
  "SearchTermsAudience","SearchTermsAudience_ByteLength",
  "SearchTermsLongTail","SearchTermsLongTail_ByteLength",
];

// Content columns (the ones where keyword highlighting applies)
const CONTENT_COLS = new Set([
  "Title",
  ...Array.from({length:5},(_,i)=>`DetailedBulletPoint_${i+1}`),
  ...Array.from({length:5},(_,i)=>`ConciseBulletPoint_${i+1}`),
  ...Array.from({length:5},(_,i)=>`ContentBulletPoint_${i+1}`),
  ...Array.from({length:5},(_,i)=>`KeyFeaturesBulletPoint_${i+1}`),
  "ProductDescription",
  "SearchTermsCore","SearchTermsSupplement","SearchTermsSymptom","SearchTermsAudience","SearchTermsLongTail",
]);

// Restricted/compliance words — highlighted blue in content
const RESTRICTED_WORDS = [
  "cure","cures","cured","treat","treats","treating","treatment","treatments",
  "diagnose","diagnoses","diagnosis","prevent","prevents","preventing","prevention",
  "heal","heals","healing","healed","disease","diseases","disorder","disorders",
  "symptom","symptoms","medical","medicine","drug","drugs","pharmaceutical",
  "fda","fda-approved","clinically proven","clinically tested","clinically studied",
  "guaranteed","guarantee","guarantees","100% guaranteed","money back guarantee",
  "best","#1","number one","number 1","top rated","award winning",
  "free shipping","in stock","buy now","add to cart","sale","discount","off",
  "click here","visit our website","see our website",
  "cancer","diabetes","alzheimer","autism","anxiety disorder","depression",
  "antibiotic","antiviral","antimicrobial",
];

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
type BatchKey = "titles"|"bullets"|"description"|"backend";
type BatchStatus = "pending"|"generating"|"review"|"approved"|"revision";
type OutSeoRow = Record<string, string|number>;
interface BatchState { status: BatchStatus; feedback: string; }
interface KwInfo { text: string; tier: number; volume: number; }

const BATCHES: {key:BatchKey;label:string;code:string}[] = [
  {key:"titles",label:"Titles",code:"B1"},
  {key:"bullets",label:"Bullet Points",code:"B2"},
  {key:"description",label:"Description",code:"B3"},
  {key:"backend",label:"Backend Search Terms",code:"B4"},
];

const STEPS = [
  {key:"config",label:"S6.1 Configuration"},
  {key:"batch-titles",label:"S6.2 Titles"},
  {key:"batch-bullets",label:"S6.3 Bullets"},
  {key:"batch-description",label:"S6.4 Description"},
  {key:"batch-backend",label:"S6.5 Backend"},
  {key:"audit",label:"S6.6 Audit"},
  {key:"final",label:"S6.7 Final OUT_SEO"},
];

const BULLET_VERSIONS = ["Detailed","Concise","Content","Key Features"] as const;

// ═══════════════════════════════════════════════════════════
// KEYWORD HIGHLIGHT HELPER
// ═══════════════════════════════════════════════════════════
function highlightKeywords(text: string, kwMap: Map<string, number>, restrictedSet?: Set<string>): JSX.Element {
  if (!text) return <>{text}</>;
  // Build combined token list: restricted words + keywords, longest first
  const allTokens: {word: string; type: "kw"|"restricted"}[] = [];
  if (kwMap.size > 0) {
    [...kwMap.keys()].forEach(k => allTokens.push({ word: k, type: "kw" }));
  }
  if (restrictedSet && restrictedSet.size > 0) {
    [...restrictedSet].forEach(r => {
      if (!allTokens.find(t => t.word === r)) allTokens.push({ word: r, type: "restricted" });
    });
  }
  if (allTokens.length === 0) return <>{text}</>;
  allTokens.sort((a, b) => b.word.length - a.word.length);
  const escaped = allTokens.map(t => t.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![a-zA-Z])(${escaped.join("|")})(?![a-zA-Z])`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) => {
        const lower = part.toLowerCase();
        if (restrictedSet && restrictedSet.has(lower)) {
          return <mark key={i} className="text-blue-400 font-semibold" style={{background:"none"}} title="Restricted/compliance word">{part}</mark>;
        }
        const tier = kwMap.get(lower);
        if (tier !== undefined) {
          return <mark key={i} className="text-red-400 font-medium bg-transparent" style={{backgroundColor:"transparent"}} title={`Tier ${tier}`}>{part}</mark>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

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

  // Research data
  const [brandName, setBrandName] = useState("");
  const [asins, setAsins] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [cosmoRows, setCosmoRows] = useState<any[]>([]);
  const [rufusRows, setRufusRows] = useState<any[]>([]);
  const [reviewRows, setReviewRows] = useState<any[]>([]);
  const [guidelines, setGuidelines] = useState("");

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
  const [revisionText, setRevisionText] = useState("");
  const [bulletTab, setBulletTab] = useState<typeof BULLET_VERSIONS[number]>("Detailed");

  // Audit
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditFeedback, setAuditFeedback] = useState("");

  // Compliance — per batch
  const [batchCompliance, setBatchCompliance] = useState<Record<BatchKey, {findings:any[];checked:boolean}>>({
    titles:{findings:[],checked:false}, bullets:{findings:[],checked:false},
    description:{findings:[],checked:false}, backend:{findings:[],checked:false},
  });
  // Config instructions (general guidance for all batches)
  const [configInstructions, setConfigInstructions] = useState("");

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

  // ── Load all data ──
  useEffect(() => {
    async function loadAll() {
      try {
        const [s1R, s2R, s3R, s4R, s5R] = await Promise.all([
          fetch(`/api/projects/${projectId}/load?phase=s1_intake`),
          fetch(`/api/projects/${projectId}/load?phase=s2_keywords`),
          fetch(`/api/projects/${projectId}/load?phase=s3_reviews`),
          fetch(`/api/projects/${projectId}/load?phase=s4_rufus`),
          fetch(`/api/projects/${projectId}/load?phase=s5_cosmo`),
        ]);
        const s1=await s1R.json(), s2=await s2R.json(), s3=await s3R.json(), s4=await s4R.json(), s5=await s5R.json();

        setBrandName(s1.project?.brand_name||"");
        setAsins(s1.asins||[]);
        setGuidelines(s1.project?.brand_guidelines||"");
        setKeywords(s2.keywords||[]);
        setReviewRows(s3.reviews||[]);
        setRufusRows(s4.rows||[]);
        setCosmoRows(s5.rows||[]);
        setHasSizeVariation((s1.asins||[]).some((a:any)=>a.size&&a.size!=="Parent"&&a.size.trim()));

        const initRows: OutSeoRow[] = (s1.asins||[]).map((a:any)=>{
          const r: OutSeoRow = {}; OUT_SEO_COLS.forEach(c=>{r[c]="";}); 
          r.ASIN=a.asin||""; r.URL=a.amazon_url||""; r.VariationID=a.variation_id||"";
          r.VariationProduct=a.variation_product||""; r.ParentageLevel=a.parentage_level||"";
          r.VariationThemeName=a.variation_theme_name||""; r.Flavor=a.flavor||"";
          r.Style=a.style||""; r.Color=a.color||""; r.Size=a.size||"";
          return r;
        });

        const savedR = await fetch(`/api/projects/${projectId}/load?phase=s7_seo`);
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
              return merged;
            }));
            setRows(mergedRows);
            setSizePlacement(saved.config?.size_placement||"end");
            const inProgress = saved.config?.in_progress !== false;
            if (!inProgress) {
              // Fully approved — go to final
              setBatches({titles:{status:"approved",feedback:""},bullets:{status:"approved",feedback:""},
                description:{status:"approved",feedback:""},backend:{status:"approved",feedback:""}});
              setIsApproved(true); setStep("final");
            } else {
              // Restore exact mid-progress batch states and step
              const savedBatches = saved.config?.batches;
              if (savedBatches) {
                setBatches(savedBatches);
              } else {
                // Legacy: derive batch status from content presence
                const hasTitle = mergedRows.some((r:OutSeoRow)=>!!r.Title);
                const hasBullets = mergedRows.some((r:OutSeoRow)=>!!r.DetailedBulletPoint_1);
                const hasDesc = mergedRows.some((r:OutSeoRow)=>!!r.ProductDescription);
                const hasBackend = mergedRows.some((r:OutSeoRow)=>!!r.SearchTermsCore);
                setBatches({
                  titles:{status:hasTitle?"approved":"pending",feedback:""},
                  bullets:{status:hasBullets?"approved":"pending",feedback:""},
                  description:{status:hasDesc?"approved":"pending",feedback:""},
                  backend:{status:hasBackend?"approved":"pending",feedback:""},
                });
              }
              const savedStep = saved.config?.step || "batch-titles";
              setStep(savedStep);
            }
          } else setRows(sortRows(initRows));
        } else setRows(sortRows(initRows));
      } catch(e:any){setError(e.message);}
      setLoading(false);
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
  const generateBatch = useCallback(async (bk: BatchKey) => {
    setGenerating(true); setError(null);
    setBatches(p=>({...p,[bk]:{...p[bk],status:"generating"}}));
    try {
      const res = await fetch(`/api/claude/seo`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({batch:bk,brandName,asins,keywords:keywords.slice(0,60),
          cosmo:cosmoRows.slice(0,15).map((c:any)=>({COSMORelationType:c.COSMORelationType,COSMOMappedValue:c.COSMOMappedValue,COSMOEntity:c.COSMOEntity})),
          rufus:rufusRows.slice(0,10).map((r:any)=>({RufusQuestion:r.RufusQuestion,RufusAnswer:(r.RufusAnswer||"").substring(0,150),RufusCOSMORelationship:r.RufusCOSMORelationship})),
          reviews:reviewRows.slice(0,15).map((r:any)=>({ReviewTheme:r.ReviewKeyThemes,ReviewRufusUsableInsight:r.ReviewRufusUsableInsight,ReviewSentiment:r.ReviewSentiment})),
          guidelines:guidelines?guidelines.substring(0,600):undefined,sizePlacement,currentRows:rows,
          feedback:batches[bk].feedback||undefined,configInstructions:configInstructions||undefined})});
      if(!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Compute merged rows in pure JS — no state reads, guaranteed fresh
      const batchRows: any[] = data.rows || [];
      const freshRows: OutSeoRow[] = rows.map(r => {
        const br = batchRows.find((b: any) => b.ASIN === r.ASIN);
        if (!br) return r;
        const merged = {...r};
        for (const key of Object.keys(br)) { if (OUT_SEO_COLS.includes(key)) (merged as any)[key] = br[key]; }
        return merged;
      });
      // Commit to state
      setRows(freshRows);
      const freshBatches = {...batches, [bk]:{status:"review" as const, feedback:""}};
      setBatches(freshBatches);
      // Run compliance directly on freshRows — zero async dependency
      scanCompliance(bk, freshRows);
      // Auto-save progress so navigating away never loses content
      await autoSave(freshRows, freshBatches, `batch-${bk}`);
    } catch(e:any){ setError(e.message); setBatches(p=>({...p,[bk]:{...p[bk],status:"review"}})); }
    setGenerating(false);
  },[brandName,asins,keywords,cosmoRows,rufusRows,reviewRows,guidelines,sizePlacement,rows,batches,mergeBatchData,configInstructions]);

  // Short display label for a column name
  const colShortLabel = (col: string): string => {
    if (col === "Title") return "Title";
    if (col === "ProductDescription") return "Desc";
    const map: Record<string,string> = {
      Detailed:"DBP", Concise:"CBP", Content:"ContBP", KeyFeatures:"KFBP"
    };
    for (const [type, short] of Object.entries(map)) {
      // eslint-disable-next-line react-doctor/js-hoist-regexp
      const m = col.match(new RegExp(`^${type}BulletPoint_(\\d)$`));
      if (m) return `${short}${m[1]}`;
    }
    if (col.startsWith("SearchTerms")) return col.replace("SearchTerms","BK-");
    return col;
  };

  // scanCompliance: pure function — receives all data as args, no closure deps
  const scanCompliance = (bk: BatchKey, scanRows: OutSeoRow[]) => {
    const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/u;
    const batchCols: Record<BatchKey, string[]> = {
      titles: ["Title"],
      bullets: ["DetailedBulletPoint_1","DetailedBulletPoint_2","DetailedBulletPoint_3","DetailedBulletPoint_4","DetailedBulletPoint_5",
                "ConciseBulletPoint_1","ConciseBulletPoint_2","ConciseBulletPoint_3","ConciseBulletPoint_4","ConciseBulletPoint_5",
                "ContentBulletPoint_1","ContentBulletPoint_2","ContentBulletPoint_3","ContentBulletPoint_4","ContentBulletPoint_5",
                "KeyFeaturesBulletPoint_1","KeyFeaturesBulletPoint_2","KeyFeaturesBulletPoint_3","KeyFeaturesBulletPoint_4","KeyFeaturesBulletPoint_5"],
      description: ["ProductDescription"],
      backend: ["SearchTermsCore","SearchTermsSupplement","SearchTermsSymptom","SearchTermsAudience","SearchTermsLongTail"],
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

  // ── Auto-save progress (rows + batches state + step) ──
  const autoSave = useCallback(async (freshRows: OutSeoRow[], freshBatches: Record<BatchKey,BatchState>, currentStep: string) => {
    try {
      await fetch(`/api/projects/${projectId}/save`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({phase:"s7_seo",data:{
          rows: freshRows,
          config:{ size_placement: sizePlacement, batches: freshBatches, step: currentStep, in_progress: true }
        }})});
    } catch(e){ /* silent — don't block UI */ }
  },[projectId,sizePlacement]);

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

  // ── Audit ──
  const runAudit = useCallback(async () => {
    setAuditRunning(true); setError(null);
    try {
      const res = await fetch(`/api/claude/seo-audit`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({brandName,rows,keywords:keywords.slice(0,60),cosmo:cosmoRows,rufus:rufusRows,
          reviews:reviewRows.slice(0,20),guidelines})});
      if(!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAuditResult(data);
    } catch(e:any){ setError(e.message); }
    setAuditRunning(false);
  },[brandName,rows,keywords,cosmoRows,rufusRows,reviewRows,guidelines]);

  // ── Save final (marks complete) ──
  const saveFinal = useCallback(async () => {
    try {
      await fetch(`/api/projects/${projectId}/save`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({phase:"s7_seo",data:{rows,config:{size_placement:sizePlacement,in_progress:false}}})});
      setIsApproved(true);
    } catch(e:any){setError(e.message);}
  },[rows,projectId,sizePlacement]);

  // ── Google Doc Export (service account → Drive) ──
  const [exportDocUrl, setExportDocUrl] = useState<string|null>(null);
  const exportGoogleDoc = async () => {
    setExportingDoc(true); setExportError(null); setExportDocUrl(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export-gdoc`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      setExportDocUrl(data.url);
    } catch(e:any){ setExportError(e.message); }
    setExportingDoc(false);
  };

  // ── CSV ──
  const downloadCSV = useCallback((cols?:string[]) => {
    const uc = cols||OUT_SEO_COLS;
    const csv = [uc.join(","),...rows.map(r=>uc.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=cols?"OUT_SEO_batch.csv":"OUT_SEO.csv"; a.click(); URL.revokeObjectURL(url);
  },[rows]);

  // ── Helpers ──
  const stepIdx = STEPS.findIndex(s=>s.key===step);
  const allApproved = BATCHES.every(b=>batches[b.key].status==="approved");

  const getBulletTabCols = (v:string) => {
    const prefix = v==="Key Features"?"KeyFeaturesBulletPoint":v==="Detailed"?"DetailedBulletPoint":v==="Concise"?"ConciseBulletPoint":"ContentBulletPoint";
    const cols=["ASIN","ParentageLevel"];
    for(let i=1;i<=5;i++){cols.push(`${prefix}_${i}`,`${prefix}_${i}_CharLength`);}
    return cols;
  };

  const getBatchContentCols = (bk: BatchKey): string[] => {
    if (bk==="titles") return ["Title"];
    if (bk==="bullets") {
      const prefix = bulletTab==="Key Features"?"KeyFeaturesBulletPoint":bulletTab==="Detailed"?"DetailedBulletPoint":bulletTab==="Concise"?"ConciseBulletPoint":"ContentBulletPoint";
      return Array.from({length:5},(_,i)=>`${prefix}_${i+1}`);
    }
    if (bk==="description") return ["ProductDescription"];
    return ["SearchTermsCore","SearchTermsSupplement","SearchTermsSymptom","SearchTermsAudience","SearchTermsLongTail"];
  };

  if (loading) return <div className="flex items-center justify-center py-20"><span className="text-zinc-500">Loading S6 SEO…</span></div>;

  // ═══════════════════════════════════════════════════════════
  // RENDER TABLE — with text wrap + keyword highlighting
  // ═══════════════════════════════════════════════════════════
  function renderTable(cols: string[]) {
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
    return (
      <div className="rounded-xl border border-surface-4 bg-surface-1 overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto" style={{scrollbarWidth:"thin"}}>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-surface-4 text-zinc-500">
                {activeCols.map(c=>{
                  const isLen = c.includes("CharLength")||c.includes("ByteLength");
                  const shortName = c
                    .replace("DetailedBulletPoint_","DetBP")
                    .replace("ConciseBulletPoint_","ConBP")
                    .replace("ContentBulletPoint_","CntBP")
                    .replace("KeyFeaturesBulletPoint_","KFBP")
                    .replace("ProductDescription","Desc")
                    .replace("SearchTerms","ST-")
                    .replace("_CharLength","Char")
                    .replace("_ByteLength","Byte")
                    .replace("VariationProduct","VarProd")
                    .replace("VariationThemeName","VarTheme")
                    .replace("ParentageLevel","Level")
                    .replace("Title_CharLength","TitleChar");
                  return <th key={c} className={`py-2 px-3 text-left font-medium whitespace-nowrap ${isLen?"w-16 text-center":""}`}>{shortName}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r,ri)=>(
                <tr key={ri} className={`border-b border-surface-4/50 hover:bg-surface-2/20 align-top ${String(r.ParentageLevel||"").toLowerCase()==="parent"?"bg-blue-500/5":""}`}>
                  {activeCols.map(c=>{
                    const v = String(r[c]??"");
                    const isLen = c.includes("CharLength")||c.includes("ByteLength");
                    const isContent = CONTENT_COLS.has(c);
                    const isParentage = c==="ParentageLevel";
                    const isParent = v.toLowerCase()==="parent";
                    if (isParentage) return (
                      <td key={c} className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${isParent?"bg-blue-500/15 text-blue-400 border-blue-500/20":"bg-purple-500/10 text-purple-400 border-purple-500/15"}`}>
                          {isParent?"PARENT":"CHILD"}
                        </span>
                      </td>
                    );
                    if (isLen) return (
                      <td key={c} className="p-2 text-zinc-500 font-mono text-center whitespace-nowrap w-14 max-w-[56px]">{v}</td>
                    );
                    const cellKey = `${r.ASIN}::${c}`;
                    const isEditing = editingCell === cellKey;
                    if (isContent && isEditing) return (
                      <td key={c} className="py-1 px-2 min-w-[280px] align-top">
                        <textarea
                          autoFocus
                          value={editingValue}
                          onChange={e=>setEditingValue(e.target.value)}
                          onKeyDown={e=>{
                            if(e.key==="Escape"){setEditingCell(null);setEditingValue("");}
                          }}
                          rows={Math.max(3,Math.ceil(editingValue.length/60))}
                          className="w-full rounded border border-brand-500/50 bg-surface-0 px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-brand-500 resize-y leading-relaxed"
                          style={{minHeight:"80px"}}
                        />
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            onClick={()=>{
                              const asin = String(r.ASIN);
                              setRows(prev => prev.map(row => row.ASIN===asin ? {...row,[c]:editingValue} : row));
                              setEditingCell(null); setEditingValue("");
                            }}
                            className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                          >✓ Confirm</button>
                          <button
                            onClick={()=>{setEditingCell(null);setEditingValue("");}}
                            className="px-2.5 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300 border border-surface-4"
                          >✕ Cancel</button>
                          <span className="text-[9px] text-zinc-600 ml-auto">{editingValue.length}c</span>
                        </div>
                      </td>
                    );
                    return (
                      <td key={c}
                        className={`py-2 px-3 ${c==="ASIN"?"font-mono text-zinc-400 whitespace-nowrap":"text-zinc-300"} ${isContent?"min-w-[280px] text-justify cursor-pointer hover:bg-amber-500/5 group/cell relative":""}`}
                        style={isContent?{whiteSpace:"pre-wrap",wordBreak:"break-word",textAlign:"justify"}:{}}
                        onClick={isContent?()=>{setEditingCell(cellKey);setEditingValue(v);}:undefined}
                        title={isContent?"Click to edit":""}
                      >
                        {isContent ? (
                          <>
                            {highlightKeywords(v, kwMap, restrictedSet)}
                            <span className="absolute top-1.5 right-1.5 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                              <svg className="size-3 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
                            </span>
                          </>
                        ) : v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // KEYWORD USAGE PANEL
  // ═══════════════════════════════════════════════════════════
  function renderKeywordUsage(bk: BatchKey) {
    const contentCols = getBatchContentCols(bk);
    const used = findUsedKeywords(rows, allKws, contentCols);
    const unused = allKws.filter(k=>!used.find(u=>u.text===k.text)).sort((a,b)=>a.tier-b.tier||b.volume-a.volume);

    const colLabel = (col: string): string => {
      if (col === "Title") return "Title";
      if (col === "ProductDescription") return "Desc";
      const bulletTypes: Record<string,string> = {Detailed:"DBP",Concise:"CBP",Content:"ContBP",KeyFeatures:"KFBP"};
      for (const [type, short] of Object.entries(bulletTypes)) {
        // eslint-disable-next-line react-doctor/js-hoist-regexp
        const match = col.match(new RegExp(`^${type}BulletPoint_(\d)$`));
        if (match) return `${short}${match[1]}`;
      }
      if (col.startsWith("SearchTerms")) return col.replace("SearchTerms","BK-");
      return col.substring(0,8);
    };

    const usedWithLoc = used.map(kw => {
      const locs = contentCols.filter(col =>
        rows.some(r => String(r[col]||"").toLowerCase().includes(kw.text))
      ).map(colLabel);
      return { ...kw, locs };
    });

    const usedByTier: Record<number, typeof usedWithLoc> = {};
    usedWithLoc.forEach(k=>{ if(!usedByTier[k.tier]) usedByTier[k.tier]=[]; usedByTier[k.tier].push(k); });

    const unusedByTier: Record<number, KwInfo[]> = {};
    unused.forEach(k=>{ if(!unusedByTier[k.tier]) unusedByTier[k.tier]=[]; unusedByTier[k.tier].push(k); });

    const toggleUnused = (text: string) => setSelectedUnused(prev => {
      const n = new Set(prev); n.has(text) ? n.delete(text) : n.add(text); return n;
    });
    const toggleUsed = (text: string) => setSelectedUsed(prev => {
      const n = new Set(prev); n.has(text) ? n.delete(text) : n.add(text); return n;
    });
    const toggleAllUnused = (kws: KwInfo[]) => {
      const allSelected = kws.every(k => selectedUnused.has(k.text));
      setSelectedUnused(prev => {
        const n = new Set(prev);
        kws.forEach(k => allSelected ? n.delete(k.text) : n.add(k.text));
        return n;
      });
    };
    const toggleAllUsed = () => {
      const allSelected = usedWithLoc.every(k => selectedUsed.has(k.text));
      setSelectedUsed(prev => {
        const n = new Set(prev);
        usedWithLoc.forEach(k => allSelected ? n.delete(k.text) : n.add(k.text));
        return n;
      });
    };

    return (
      <div className="rounded-xl border border-surface-4 bg-surface-1 p-4 mt-3 space-y-4">
        <div className="flex items-center gap-3 text-[10px]">
          <h3 className="text-xs font-bold text-zinc-300 flex-1">Keywords — {BATCHES.find(b=>b.key===bk)?.label}</h3>
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">{used.length} used</span>
          <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400">{unused.length} unused</span>
          <span className="text-zinc-600">of {allKws.length} total</span>
        </div>

        {/* ── LEGEND ── */}
        <div className="flex items-center gap-4 text-[9px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="text-red-400 font-medium">word</span> = SEO keyword</span>
          <span className="flex items-center gap-1"><span className="text-blue-400 font-semibold">word</span> = restricted/compliance</span>
        </div>

        {/* ── USED KEYWORDS with location + remove checkbox ── */}
        {usedWithLoc.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Used Keywords</div>
              {selectedUsed.size > 0 && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                  − {selectedUsed.size} to remove
                </span>
              )}
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-surface-4 text-zinc-600">
                  <th className="py-1 px-2 text-left w-6">
                    <input type="checkbox" className="rounded border-zinc-600 bg-zinc-800 accent-red-500 cursor-pointer"
                      checked={usedWithLoc.length > 0 && usedWithLoc.every(k => selectedUsed.has(k.text))}
                      onChange={toggleAllUsed}/>
                  </th>
                  <th className="py-1 px-2 text-left font-medium">Keyword</th>
                  <th className="py-1 px-2 text-left font-medium">Tier</th>
                  <th className="py-1 px-2 text-left font-medium">Vol</th>
                  <th className="py-1 px-2 text-left font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(usedByTier).sort(([a],[b])=>Number(a)-Number(b)).flatMap(([tier, kws]) =>
                  kws.map(k => (
                    <tr key={k.text} className={`border-b border-surface-4/30 hover:bg-surface-2/20 cursor-pointer ${selectedUsed.has(k.text)?"bg-red-500/5":""}`} onClick={()=>toggleUsed(k.text)}>
                      <td className="py-1 px-2">
                        <input type="checkbox" className="rounded border-zinc-600 bg-zinc-800 accent-red-500 cursor-pointer"
                          checked={selectedUsed.has(k.text)} onChange={()=>toggleUsed(k.text)} onClick={e=>e.stopPropagation()}/>
                      </td>
                      <td className="py-1 px-2 text-red-400 font-medium">{k.text}</td>
                      <td className="py-1 px-2 text-zinc-500">T{tier}</td>
                      <td className="py-1 px-2 text-zinc-500 font-mono">{k.volume > 0 ? k.volume.toLocaleString() : "—"}</td>
                      <td className="py-1 px-2 text-zinc-400">{k.locs.join(", ") || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── UNUSED KEYWORDS — 4 columns by tier, sorted by volume, with checkboxes ── */}
        {unused.length > 0 && (
          <div className="pt-2 border-t border-surface-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Top Unused Keywords</div>
              {selectedUnused.size > 0 && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  + {selectedUnused.size} to add
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[1,2,3,4].map(t => {
                const tKws = (unusedByTier[t] || []).slice(0, 15);
                if (tKws.length === 0) return null;
                const allTierSelected = tKws.every(k => selectedUnused.has(k.text));
                return (
                  <div key={t}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <input type="checkbox" className="rounded border-zinc-600 bg-zinc-800 accent-emerald-500 cursor-pointer"
                        checked={allTierSelected} onChange={()=>toggleAllUnused(tKws)}/>
                      <span className="text-[9px] font-bold text-zinc-600 uppercase">T{t} ({tKws.length})</span>
                    </div>
                    <div className="space-y-0.5">
                      {tKws.map(k => (
                        <div key={k.text} className={`flex items-center gap-1 text-[9px] rounded px-1 cursor-pointer hover:bg-surface-2/50 ${selectedUnused.has(k.text)?"bg-emerald-500/5":""}`}
                          onClick={()=>toggleUnused(k.text)}>
                          <input type="checkbox" className="rounded border-zinc-600 bg-zinc-800 accent-emerald-500 cursor-pointer shrink-0"
                            checked={selectedUnused.has(k.text)} onChange={()=>toggleUnused(k.text)} onClick={e=>e.stopPropagation()}/>
                          <span className="text-zinc-400 truncate flex-1">{k.text}</span>
                          {k.volume > 0 && <span className="text-zinc-600 font-mono shrink-0">{k.volume >= 1000 ? `${(k.volume/1000).toFixed(1)}k` : k.volume}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VALIDATION BADGES
  // ═══════════════════════════════════════════════════════════
  function renderValidation(bk: BatchKey) {
    if (bk==="titles") return (
      <div className="flex flex-wrap gap-2 mt-2">
        {rows.map(r=>{const len=Number(r.Title_CharLength)||String(r.Title||"").length;const ok=len>=190&&len<=200;
        return <span key={String(r.ASIN)} className={`px-2 py-0.5 rounded text-[9px] font-mono ${ok?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{String(r.ASIN).substring(0,10)} {len}c {ok?"✓":"✗"}</span>;})}
      </div>
    );
    if (bk==="description") return (
      <div className="flex flex-wrap gap-2 mt-2">
        {rows.map(r=>{const len=Number(r.ProductDescription_CharLength)||String(r.ProductDescription||"").length;const ok=len>=1000&&len<=1200;
        return <span key={String(r.ASIN)} className={`px-2 py-0.5 rounded text-[9px] font-mono ${ok?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{String(r.ASIN).substring(0,10)} {len}c {ok?"✓":"✗"}</span>;})}
      </div>
    );
    if (bk==="backend") return (
      <div className="flex flex-wrap gap-2 mt-2">
        {rows.map(r=>{const sets=["SearchTermsCore","SearchTermsSupplement","SearchTermsSymptom","SearchTermsAudience","SearchTermsLongTail"];
        const allOk=sets.every(s=>{const b=Number(r[`${s}_ByteLength`])||0;return b>=220&&b<=250;});
        return <span key={String(r.ASIN)} className={`px-2 py-0.5 rounded text-[9px] font-mono ${allOk?"bg-emerald-500/10 text-emerald-400":"bg-red-500/10 text-red-400"}`}>{String(r.ASIN).substring(0,10)} {allOk?"✓ 220-250B":"✗ check bytes"}</span>;})}
      </div>
    );
    return null;
  }

  return (
    <div className="max-w-6xl">


      <h1 className="text-xl font-extrabold tracking-tight text-zinc-100 mb-1">SEO Content — OUT_SEO</h1>
      <p className="text-xs text-zinc-500 mb-4">{brandName} • {asins.length} ASINs • {OUT_SEO_COLS.length} columns</p>
      <StepNav
        steps={STEPS}
        currentStep={step}
        onStepClick={setStep}
        completedSteps={new Set(STEPS.filter(s => {
          // A batch step is navigable if it has been generated (status !== pending)
          if (s.key.startsWith('batch-')) {
            const bk = s.key.replace('batch-','') as BatchKey;
            return batches[bk].status !== 'pending';
          }
          // Non-batch steps: navigable if before current or already visited
          const si = STEPS.findIndex(x=>x.key===s.key);
          return si < stepIdx;
        }).map(s=>s.key))}
        isApproved={isApproved}
      />

      {/* Batch Status */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-lg border border-surface-4 bg-surface-1">
        <span className="text-[10px] text-zinc-500 font-bold uppercase mr-2">Batch</span>
        {BATCHES.map(b=>(
          <div key={b.key} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
            batches[b.key].status==="approved"?"bg-emerald-500/10 text-emerald-400":
            batches[b.key].status==="review"||batches[b.key].status==="generating"?"bg-amber-500/10 text-amber-400":
            batches[b.key].status==="revision"?"bg-red-500/10 text-red-400":"bg-zinc-800/50 text-zinc-600"}`}>
            {b.code} <span className="hidden sm:inline">{b.label}</span>{batches[b.key].status==="approved"&&" ✓"}
          </div>
        ))}
      </div>

      {error&&<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 mb-4"><p className="text-xs text-red-400">{error}</p><button onClick={()=>setError(null)} className="text-[10px] text-red-500 underline mt-1">Dismiss</button></div>}

      {/* ═══════════ CONFIG ═══════════ */}
      {step==="config"&&(
        <div className="rounded-xl border border-surface-4 bg-surface-1 p-6 space-y-5">
          <h2 className="text-sm font-bold text-zinc-200">S6.1 — Pre-Generation Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            {[{l:"ASINs",v:asins.length},{l:"Keywords",v:keywords.length},{l:"COSMO",v:cosmoRows.length},{l:"Rufus",v:rufusRows.length}].map(d=>(
              <div key={d.l} className="rounded-lg border border-surface-4 bg-surface-2/50 p-3"><div className="text-zinc-500">{d.l}</div><div className="text-sm font-bold text-zinc-200">{d.v}</div></div>
            ))}
          </div>
          {hasSizeVariation?(
            <div className="border border-amber-500/20 rounded-lg p-4 bg-amber-500/5">
              <h3 className="text-xs font-bold text-amber-400 mb-2">Size Placement Lock</h3>
              <div className="space-y-2">
                {[{value:"end",label:"End of the title",ex:"Brand - Product - Feature - 16oz"},{value:"after-brand",label:"After brand name",ex:"Brand 16oz - Product - Feature"},{value:"after-descriptor",label:"After product descriptor",ex:"Brand - Product 16oz - Feature"}].map(o=>(
                  <label key={o.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${sizePlacement===o.value?"border-amber-500/50 bg-amber-500/10":"border-surface-4"}`}>
                    <input type="radio" name="sp" value={o.value} checked={sizePlacement===o.value} onChange={()=>setSizePlacement(o.value)} className="mt-0.5 accent-amber-500"/>
                    <div><div className="text-xs font-medium text-zinc-200">{o.label}</div><div className="text-[10px] text-zinc-500 font-mono">{o.ex}</div></div>
                  </label>
                ))}
              </div>
            </div>
          ):<div className="border border-surface-4 rounded-lg p-4 bg-surface-2/30"><p className="text-xs text-zinc-500">No size variation — size placement not required.</p></div>}

          {/* Generation Guidance */}
          <div className="border border-surface-4 rounded-lg p-4 bg-surface-2/30">
            <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1.5">Generation Guidance (Optional)</div>
            <p className="text-[10px] text-zinc-600 mb-2">Provide instructions that will apply to ALL batches — tone, style, specific phrases to include/avoid, focus areas, etc.</p>
            <textarea value={configInstructions} onChange={e=>setConfigInstructions(e.target.value)}
              placeholder="e.g. 'Use a warm, conversational tone. Emphasize the organic ingredients. Avoid mentioning competitors. Focus on the premium quality angle...'"
              rows={3} className="w-full rounded-md border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none resize-y"/>
          </div>

          <button onClick={()=>setStep("batch-titles")} disabled={hasSizeVariation&&!sizePlacement}
            className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-brand-400 disabled:opacity-40">
            {hasSizeVariation&&!sizePlacement?"Select Size Placement":"Lock Config → Generate Titles"}
          </button>
        </div>
      )}

      {/* ═══════════ BATCH STEPS ═══════════ */}
      {BATCHES.map((batch,bi)=>{
        if(step!==`batch-${batch.key}`) return null;
        const bs=batches[batch.key];
        const cols = batch.key==="bullets"?getBulletTabCols(bulletTab):
          batch.key==="titles"?["ASIN","ParentageLevel","VariationProduct","Flavor","Style","Color","Size","Title","Title_CharLength"]:
          batch.key==="description"?["ASIN","ParentageLevel","ProductDescription","ProductDescription_CharLength"]:
          ["ASIN","ParentageLevel","SearchTermsCore","SearchTermsCore_ByteLength","SearchTermsSupplement","SearchTermsSupplement_ByteLength","SearchTermsSymptom","SearchTermsSymptom_ByteLength","SearchTermsAudience","SearchTermsAudience_ByteLength","SearchTermsLongTail","SearchTermsLongTail_ByteLength"];

        return (
          <div key={batch.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-200">{batch.code} — {batch.label}</h2>
              {bs.status === "generating" ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white" style={{background:"linear-gradient(135deg,#c84b31,#e8602a)"}}>
                  <svg className="size-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.987 1C5.924 1 1 5.923 1 11.987 1 18.05 5.924 23 11.987 23 18.05 23 23 18.05 23 11.987 23 5.923 18.05 1 11.987 1zm.013 3.5c.46 0 .833.373.833.833v3.334a.833.833 0 0 1-1.666 0V5.333c0-.46.373-.833.833-.833zm5.196 2.304a.833.833 0 0 1 0 1.179l-2.357 2.357a.833.833 0 0 1-1.179-1.179l2.357-2.357a.833.833 0 0 1 1.179 0zM5.804 6.804a.833.833 0 0 1 1.179 0l2.357 2.357a.833.833 0 1 1-1.179 1.179L5.804 7.983a.833.833 0 0 1 0-1.179zM4.5 11.154h3.334a.833.833 0 0 1 0 1.666H4.5a.833.833 0 0 1 0-1.666zm11.666 0H19.5a.833.833 0 0 1 0 1.666h-3.334a.833.833 0 0 1 0-1.666zm-3.023 3.189a.833.833 0 0 1 0 1.179l-2.357 2.357a.833.833 0 0 1-1.179-1.179l2.357-2.357a.833.833 0 0 1 1.179 0zM9.34 14.34a.833.833 0 0 1 1.179 1.179l-2.357 2.357a.833.833 0 0 1-1.179-1.179zm2.647 2.327a.833.833 0 0 1 .833.833V20.833a.833.833 0 0 1-1.666 0V17.5c0-.46.373-.833.833-.833z"/>
                  </svg>
                  Claude is generating…
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bs.status==="approved"?"bg-emerald-500/10 text-emerald-400":bs.status==="review"?"bg-amber-500/10 text-amber-400":bs.status==="revision"?"bg-red-500/10 text-red-400":"bg-zinc-800 text-zinc-500"}`}>{bs.status.toUpperCase()}</span>
              )}
            </div>

            {/* Generate */}
            {(bs.status==="pending"||bs.status==="revision")&&(
              <div className="rounded-xl border border-surface-4 bg-surface-1 p-6 text-center">
                {bs.status==="revision"&&bs.feedback&&<div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-left"><div className="text-[10px] text-red-400 font-bold mb-1">Revision:</div><p className="text-xs text-zinc-300">{bs.feedback}</p></div>}
                <AIGeneratingButton
                  isGenerating={generating}
                  onClick={()=>generateBatch(batch.key)}
                  label={bs.status==="revision"?`Ask Claude to Regenerate ${batch.label}`:`Ask Claude to Generate ${batch.label}`}
                />
              </div>
            )}

            {/* Review / Approved table */}
            {(bs.status==="review"||bs.status==="approved")&&(
              <>
                {batch.key==="bullets"&&(
                  <div className="flex items-center gap-1">
                    {BULLET_VERSIONS.map(v=><button key={v} onClick={()=>setBulletTab(v)} className={`px-3 py-1 rounded-full text-[10px] font-bold ${bulletTab===v?"bg-brand-500/20 text-brand-400 border border-brand-500/30":"bg-surface-2 text-zinc-500 border border-surface-4 hover:text-zinc-300"}`}>{v}</button>)}
                  </div>
                )}

                {renderTable(cols)}
                {renderValidation(batch.key)}
                {renderKeywordUsage(batch.key)}

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
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-[11px] text-emerald-400">
                      <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      <span className="font-bold">Compliance clear</span>
                      <span className="text-emerald-400/60">— no prohibited terms, emoji, or formatting issues detected</span>
                    </div>
                  );

                  return (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center gap-3 px-3 py-2 border-b border-red-500/15">
                        <svg className="size-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008Z"/></svg>
                        {critCount > 0 && <span className="text-[11px] font-bold text-red-400">{critCount} critical</span>}
                        {warnCount > 0 && <span className="text-[11px] font-bold text-amber-400">{warnCount} warnings</span>}
                        {activeIssues.length < grouped.length && <span className="text-[10px] text-zinc-500">{grouped.length - activeIssues.length} bypassed</span>}
                        <span className="text-[10px] text-zinc-600 ml-1">— terms highlighted in blue above · check to bypass</span>
                        {grouped.length > 0 && (
                          <button
                            onClick={()=>setDismissedFindings(p=>{const n=new Set(p);grouped.forEach(g=>n.add(`${batch.key}::${g.key}`));return n;})}
                            className="ml-auto text-[9px] text-zinc-600 hover:text-zinc-400 underline"
                          >bypass all</button>
                        )}
                      </div>
                      {/* Table */}
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-red-500/10 text-zinc-600 text-[9px] uppercase tracking-wide">
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
                                    className="rounded border-zinc-600 bg-zinc-800 accent-amber-500 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${g.severity==="critical"?"bg-red-500/20 text-red-400":"bg-amber-500/20 text-amber-400"}`}>
                                    {g.severity}
                                  </span>
                                </td>
                                <td className={`py-2 px-3 ${dismissed?"line-through":""} ${g.severity==="critical"?"text-red-300":"text-amber-300"}`}>
                                  {g.detail}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {g.locations.map(loc=>(
                                      <span key={loc} className="px-1.5 py-0.5 rounded bg-surface-2 border border-surface-4 font-mono text-[9px] text-zinc-400">{loc}</span>
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
                      <button onClick={()=>downloadCSV(cols)} className="rounded-lg border border-surface-4 px-4 py-2 text-sm text-zinc-400 hover:bg-surface-2">Download {batch.code} CSV</button>
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
                          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 flex items-center gap-2 shrink-0"
                        >
                          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                          Regenerate {batch.code}
                          {selectedUnused.size > 0 && <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded font-bold">+{selectedUnused.size}</span>}
                          {selectedUsed.size > 0 && <span className="bg-red-500/20 text-red-300 text-[9px] px-1.5 py-0.5 rounded font-bold">−{selectedUsed.size}</span>}
                        </button>
                      )}
                      <button onClick={()=>approveBatch(batch.key)} className="ml-auto rounded-lg bg-accent-green px-5 py-2 text-sm font-bold text-surface-0 hover:bg-accent-green/80 shrink-0">✓ Approve {batch.code}</button>
                    </div>
                    <div className="rounded-lg border border-surface-4 bg-surface-2/30 p-3">
                      <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1.5">Or provide feedback & regenerate</div>
                      <textarea value={revisionText} onChange={e=>setRevisionText(e.target.value)}
                        placeholder={`Describe changes for ${batch.label}…`}
                        rows={2} className="w-full rounded-md border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none resize-y"/>
                      {revisionText.trim()&&(
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={()=>{reviseBatch(batch.key,revisionText);setRevisionText("");}}
                            className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-bold text-surface-0 hover:bg-brand-400">
                            Regenerate {batch.code} with Feedback
                          </button>
                          <button onClick={()=>setRevisionText("")} className="text-[10px] text-zinc-600 hover:text-zinc-400">Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {bs.status==="approved"&&(
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-emerald-400 font-bold">✓ {batch.code} Approved</span>
                      <button onClick={()=>downloadCSV(cols)} className="rounded-lg border border-surface-4 px-3 py-1.5 text-[10px] text-zinc-500 hover:bg-surface-2">Download CSV</button>
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
                          className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-black hover:bg-amber-400 flex items-center gap-2 shrink-0"
                        >
                          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                          Regenerate {batch.code}
                          {selectedUnused.size > 0 && <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded font-bold">+{selectedUnused.size}</span>}
                          {selectedUsed.size > 0 && <span className="bg-red-500/20 text-red-300 text-[9px] px-1.5 py-0.5 rounded font-bold">−{selectedUsed.size}</span>}
                        </button>
                      )}
                    </div>
                    <div className="rounded-lg border border-surface-4 bg-surface-2/30 p-3">
                      <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1.5">Provide feedback & regenerate</div>
                      <textarea value={revisionText} onChange={e=>setRevisionText(e.target.value)}
                        placeholder={`Describe changes for ${batch.label}... (e.g. "make bullet 2 more benefit-focused", "add more emotional language to title")`}
                        rows={2} className="w-full rounded-md border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none resize-y"/>
                      {revisionText.trim()&&(
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={()=>{reviseBatch(batch.key,revisionText);setRevisionText("");}}
                            className="rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-bold text-surface-0 hover:bg-brand-400">
                            Regenerate {batch.code} with Feedback
                          </button>
                          <button onClick={()=>setRevisionText("")} className="text-[10px] text-zinc-600 hover:text-zinc-400">Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* ═══════════ AUDIT ═══════════ */}
      {step==="audit"&&(
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-200">S6.6 — Pre-Lock Audit</h2>
          <p className="text-xs text-zinc-500">AI audit checks generated content against S1–S5 research data before final lock.</p>

          {!auditResult ? (
            <div className="rounded-xl border border-surface-4 bg-surface-1 p-6 text-center">
              <AIGeneratingButton
                isGenerating={auditRunning}
                onClick={runAudit}
                label="Ask Claude to Run S6.6 Audit"
              />
            </div>
          ) : (
            <>
              {/* Scores */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {l:"Compliance",v:auditResult.complianceScore,max:100},
                  {l:"Keyword Coverage",v:auditResult.keywordCoverage,max:100},
                  {l:"COSMO Density",v:auditResult.cosmoDensity,max:100},
                  {l:"Rufus Coverage",v:auditResult.rufusCoverage,max:100},
                  {l:"Human Voice",v:auditResult.humanVoice,max:100},
                  {l:"Buyer Journey",v:auditResult.buyerJourney,max:100},
                  {l:"Variation Consistency",v:auditResult.variationConsistency,max:100},
                  {l:"Overall",v:auditResult.overallScore,max:100},
                ].map(s=>{
                  const pct = Math.round(((s.v||0)/s.max)*100);
                  const color = pct>=80?"emerald":pct>=60?"amber":"red";
                  return (
                    <div key={s.l} className={`rounded-lg border border-${color}-500/20 bg-${color}-500/5 p-3`}>
                      <div className={`text-sm font-extrabold text-${color}-400`}>{s.v ?? "—"}</div>
                      <div className="text-[9px] text-zinc-500 uppercase">{s.l}</div>
                    </div>
                  );
                })}
              </div>

              {/* Findings */}
              {auditResult.findings?.length > 0 && (
                <div className="rounded-xl border border-surface-4 bg-surface-1 p-4">
                  <h3 className="text-xs font-bold text-zinc-300 mb-3">Findings & Recommendations</h3>
                  <div className="space-y-2">
                    {auditResult.findings.map((f: any, i: number) => (
                      <div key={i} className={`rounded-lg border p-3 ${f.severity==="critical"?"border-red-500/20 bg-red-500/5":f.severity==="warning"?"border-amber-500/20 bg-amber-500/5":"border-surface-4 bg-surface-2/30"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${f.severity==="critical"?"bg-red-500/20 text-red-400":f.severity==="warning"?"bg-amber-500/20 text-amber-400":"bg-blue-500/20 text-blue-400"}`}>{f.severity}</span>
                          <span className="text-xs font-medium text-zinc-300">{f.category}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400">{f.detail}</p>
                        {f.suggestion && <p className="text-[11px] text-brand-400 mt-1">→ {f.suggestion}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Keyword coverage summary */}
              {renderKeywordUsage("backend")}

              {/* Actions */}
              <div className="rounded-lg border border-surface-4 bg-surface-2/30 p-4 space-y-3">
                <div className="text-[10px] text-zinc-500 font-bold uppercase">Provide feedback & improve</div>
                <textarea value={auditFeedback} onChange={e=>setAuditFeedback(e.target.value)}
                  placeholder="Describe improvements... (e.g. 'strengthen COSMO relationships in bullets 3-4', 'title needs more emotional appeal', 'backend is missing supplement keywords')"
                  rows={3} className="w-full rounded-md border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none resize-y"/>
                {auditFeedback.trim() && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-zinc-500">Send to:</span>
                    {BATCHES.map(b=>(
                      <button key={b.key} onClick={()=>{
                        reviseBatch(b.key as BatchKey, auditFeedback);
                        setStep(`batch-${b.key}`); setAuditFeedback(""); setAuditResult(null);
                      }} className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-[10px] font-bold text-amber-400 hover:bg-amber-500/10">
                        {b.code} {b.label}
                      </button>
                    ))}
                    <button onClick={()=>setAuditFeedback("")} className="text-[10px] text-zinc-600 hover:text-zinc-400 ml-2">Cancel</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button onClick={()=>setAuditResult(null)} className="rounded-lg border border-surface-4 px-4 py-2 text-sm text-zinc-400 hover:bg-surface-2">Re-run Audit</button>
                <button onClick={()=>setStep("final")} className="ml-auto rounded-lg bg-accent-green px-5 py-2 text-sm font-bold text-surface-0 hover:bg-accent-green/80 shrink-0">
                  ✓ Pass Audit → Final
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════ FINAL ═══════════ */}
      {step==="final"&&(
        <div className="space-y-4">
          {!allApproved?(
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center"><p className="text-sm text-amber-400">Not all batches approved yet.</p></div>
          ):!isApproved?(
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-zinc-200">S6.7 — Final OUT_SEO ({OUT_SEO_COLS.length} Columns)</h2>
              {renderTable(OUT_SEO_COLS)}
              {renderKeywordUsage("backend")}

              {/* Feedback before lock */}
              <div className="rounded-lg border border-surface-4 bg-surface-2/30 p-4 space-y-3">
                <div className="text-[10px] text-zinc-500 font-bold uppercase">Want changes? Send feedback to a batch</div>
                <textarea value={revisionText} onChange={e=>setRevisionText(e.target.value)}
                  placeholder="Describe what to change... (e.g. 'title 2 needs more keywords', 'bullet 5 should focus on size differences', 'backend missing supplement terms')"
                  rows={2} className="w-full rounded-md border border-surface-4 bg-surface-1 px-3 py-2 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none resize-y"/>
                {revisionText.trim() && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-zinc-500">Send to:</span>
                    {BATCHES.map(b=>(
                      <button key={b.key} onClick={()=>{
                        reviseBatch(b.key as BatchKey, revisionText);
                        setStep(`batch-${b.key}`); setRevisionText("");
                      }} className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-[10px] font-bold text-amber-400 hover:bg-amber-500/10">
                        {b.code} {b.label}
                      </button>
                    ))}
                    <button onClick={()=>setRevisionText("")} className="text-[10px] text-zinc-600 hover:text-zinc-400 ml-2">Cancel</button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button onClick={()=>downloadCSV()} className="rounded-lg border border-surface-4 px-4 py-2 text-sm text-zinc-400 hover:bg-surface-2">Download OUT_SEO.csv</button>
                <button onClick={()=>setStep("audit")} className="rounded-lg border border-surface-4 px-4 py-2 text-sm text-zinc-400 hover:bg-surface-2">← Back to Audit</button>
                <button onClick={saveFinal} className="rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80">✓ Save & Lock S6</button>
              </div>
            </div>
          ):(
            <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-6 text-center space-y-4">
              <div>
                <div className="mb-1 text-lg font-extrabold text-accent-green">S6 SEO Content — Locked ✓</div>
                <p className="text-sm text-zinc-400">{rows.length} ASINs × {OUT_SEO_COLS.length} columns</p>
              </div>
              {/* Export to Google Drive */}
              <div className="flex flex-col items-center gap-3">
                {exportDocUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                      <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                      </svg>
                      Saved to Google Drive
                    </div>
                    <a href={exportDocUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
                      style={{background:"linear-gradient(135deg,#1a73e8,#0d62d1)"}}>
                      <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14.727 6.727H14V0H4.91C4.125 0 3.5.625 3.5 1.41V22.59c0 .784.625 1.41 1.41 1.41H19.09c.784 0 1.41-.625 1.41-1.41V6.727h-5.773zM16 18H8v-1.5h8V18zm0-3H8v-1.5h8V15zm0-3H8v-1.5h8V12zM14 7V1l6 6h-6z"/>
                      </svg>
                      Open Google Doc
                    </a>
                    <button onClick={()=>setExportDocUrl(null)} className="text-[10px] text-zinc-600 hover:text-zinc-400 underline">Export again</button>
                  </div>
                ) : (
                  <button
                    onClick={exportGoogleDoc}
                    disabled={exportingDoc}
                    className="group relative flex items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60 overflow-hidden"
                    style={{background:"linear-gradient(135deg,#1a73e8,#0d62d1)"}}
                  >
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-150"/>
                    {exportingDoc ? (
                      <>
                        <svg className="size-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        <span className="relative">Exporting to Drive…</span>
                      </>
                    ) : (
                      <>
                        <svg className="relative size-4 shrink-0" viewBox="0 0 87.3 78" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#fff"/>
                          <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.3c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#fff"/>
                          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#fff"/>
                          <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#fff"/>
                          <path d="M59.8 52.8H27.5L13.75 76.6c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#fff"/>
                          <path d="M73.4 26.4l-12.6-21.9c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 27.8H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#fff"/>
                        </svg>
                        <span className="relative">Export to Google Drive</span>
                      </>
                    )}
                  </button>
                )}
                {!exportDocUrl && !exportingDoc && (
                  <p className="text-[10px] text-zinc-600">Saves directly to your company Drive · organized by brand</p>
                )}
                {exportError && <p className="text-[10px] text-red-400 max-w-xs text-center">{exportError}</p>}
              </div>
              <div className="flex items-center justify-center gap-3 pt-1 border-t border-accent-green/20">
                <button onClick={()=>downloadCSV()} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">Download OUT_SEO.csv</button>
                <button onClick={()=>{setIsApproved(false);setStep("audit");}} className="rounded-lg border border-surface-4 px-3 py-2 text-xs text-zinc-500 hover:bg-surface-2 hover:text-zinc-300">Unlock for Editing</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
