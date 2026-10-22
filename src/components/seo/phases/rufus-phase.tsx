/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/rerender-state-only-in-handlers */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/no-array-index-as-key */
"use client";

import { useState, useCallback, useEffect } from "react";
import AIGeneratingButton from "@/components/seo/ai-generating-button";
import { useRouter, useParams } from "next/navigation";
import AICostTracker from "@/components/seo/ai-cost-tracker";
import { markPhaseApproved, useSectionHeader } from "@/components/seo/project-shell";
import { getProjectState } from "@/components/seo/project-shell";
import { seoExportFilename } from "@/lib/seo/export-filename";

const RUFUS_STEPS = [
  { key: "phase1_display", label: "S4.1 Phase 1 Questions" },
  { key: "phase1_input", label: "S4.2 Phase 1 Answers" },
  { key: "phase1_confirm", label: "S4.3 Phase 1 Confirm" },
  { key: "phase2_display", label: "S4.4 Phase 2 Questions" },
  { key: "phase2_input", label: "S4.5 Phase 2 Answers" },
  { key: "phase2_confirm", label: "S4.6 Phase 2 Confirm" },
  { key: "review", label: "S4.7 Review Q&A Insights" },
  { key: "approved", label: "S4.8 Approved" },
];

// Phase 1 canonical questions (immutable per S4.3.1.3)
const PHASE1_QUESTIONS = [
  "What is this product for?",
  "What do people like about this product?",
  "What do people NOT like about this product?",
  "What are people buying instead of this product?",
  "Why do customers choose this product over alternatives?",
];

const PHASE1_PASTE_BLOCK = `Please provide answer followed by the following questions:
What is this product for?
What do people like about this product?
What do people NOT like about this product?
What are people buying instead of this product?
Why do customers choose this product over alternatives?`;

interface QAPair {
  question: string;
  answer: string;
}

interface AnalyzedRufus {
  ASIN: string;
  RufusQuestion: string;
  RufusAnswer: string;
  RufusQuestionCategory: string;
  RufusInsightType: string;
  RufusPrimaryObjectionAddressed: string;
  RufusPrimaryDesireAddressed: string;
  RufusCOSMORelationship: string;
  RufusUsageContext: string;
  RufusNotes: string;
}

type RufusStep = "phase1_display" | "phase1_input" | "phase1_confirm" | "phase2_display" | "phase2_input" | "phase2_confirm" | "analysis" | "review" | "approved";

export default function RufusPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [step, setStep] = useState<RufusStep>("phase1_display");
  const [copied, setCopied] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [parentAsin, setParentAsin] = useState<{ asin: string; amazon_url: string } | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const [guidelinesText, setGuidelinesText] = useState("");

  // Phase 1
  const [phase1Answers, setPhase1Answers] = useState<string[]>(["", "", "", "", ""]);
  const [phase1Bulk, setPhase1Bulk] = useState("");

  // Phase 2
  const [phase2Questions, setPhase2Questions] = useState<string[]>([]);
  const [phase2Answers, setPhase2Answers] = useState<string[]>([]);
  const [phase2Bulk, setPhase2Bulk] = useState("");
  const [isGeneratingQ, setIsGeneratingQ] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [genUsage, setGenUsage] = useState<any>(null);

  // Analysis
  const [analyzedRows, setAnalyzedRows] = useState<AnalyzedRufus[]>([]);
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiStartTime, setAiStartTime] = useState<number | null>(null);
  const [aiUsage, setAiUsage] = useState<any>(null);

  // ── Load saved data on mount ────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        // Load brand guidelines from S1
        const s1Res = await fetch(`/api/seo/projects/${projectId}/load?phase=s1_intake`);
        if (s1Res.ok) {
          const s1 = await s1Res.json();
          if (s1.project?.brand_guidelines) setGuidelinesText(s1.project.brand_guidelines);
        }

        // Load parent ASIN
        const asinRes = await fetch(`/api/seo/projects/${projectId}/load?phase=parent_asin`);
        if (asinRes.ok) {
          const { parent } = await asinRes.json();
          if (parent) setParentAsin(parent);
        }

        // Load saved rufus data
        const rufusRes = await fetch(`/api/seo/projects/${projectId}/load?phase=s4_rufus`);
        if (rufusRes.ok) {
          const data = await rufusRes.json();
          if (data.rows && data.rows.length > 0) {
            setAnalyzedRows(data.rows);
            // Reconstruct phase1/phase2 answers from saved rows
            const p1: string[] = ["", "", "", "", ""];
            const p2q: string[] = [];
            const p2a: string[] = [];
            for (const r of data.rows) {
              const p1idx = PHASE1_QUESTIONS.findIndex(q =>
                q.toLowerCase() === (r.RufusQuestion || "").toLowerCase()
              );
              if (p1idx >= 0) {
                p1[p1idx] = r.RufusAnswer || "";
              } else {
                p2q.push(r.RufusQuestion || "");
                p2a.push(r.RufusAnswer || "");
              }
            }
            setPhase1Answers(p1);
            if (p2q.length > 0) {
              setPhase2Questions(p2q);
              setPhase2Answers(p2a);
            }
            // Check if S4 was actually approved (project advanced to S5+)
            const projRes = await fetch(`/api/seo/projects/${projectId}`);
            const proj = projRes.ok ? await projRes.json() : null;
            const approved = proj?.s4ApprovedAt != null;
            if (approved) {
              setCompletedSteps(new Set(RUFUS_STEPS.map(s => s.key)));
              setIsApproved(true);
              setStep("approved");
            } else {
              // Draft — go to review step so user can approve
              setCompletedSteps(prev => new Set([...prev, "phase1_display", "phase1_input", "phase1_confirm", "phase2_display", "phase2_input", "phase2_confirm"]));
              setStep("review");
            }
          }
        }
      } catch (err) {
        console.error("[S4 Alexa for Shopping] Failed to load saved data:", err);
      }
      setLoadingState(false);
    }
    load();
  }, [projectId]);

  // ── Copy paste block ──────────────────────────────────────

  const copyPasteBlock = useCallback(() => {
    navigator.clipboard.writeText(PHASE1_PASTE_BLOCK);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // ── Shared Alexa for Shopping answer cleaner ──────────────────────────
  const cleanRufusAnswer = (text: string): string => {
    return text.split("\n")
      .filter(l => {
        const t = l.trim().toLowerCase();
        if (!t) return false;
        if (t === "see more" || t === "more details" || t === "customer question") return false;
        if (t.startsWith("i can't help") || t.startsWith("i cannot help")) return false;
        if (t.startsWith("i'd recommend:") || t.startsWith("i would recommend:")) return false;
        return true;
      })
      .join("\n")
      .trim();
  };

  // ── Generic question-answer parser for Alexa for Shopping output ──────
  const parseRufusBulk = (text: string, questions: string[]): string[] => {
    const answers = new Array(questions.length).fill("");
    if (!text.trim()) return answers;

    const lines = text.split("\n");
    const questionPositions: {lineIdx: number; qIdx: number}[] = [];

    for (let li = 0; li < lines.length; li++) {
      const lineLow = lines[li].toLowerCase().trim();
      if (!lineLow || lineLow.length < 15) continue;

      for (let qi = 0; qi < questions.length; qi++) {
        if (questionPositions.some(p => p.qIdx === qi)) continue;
        const qLow = questions[qi].toLowerCase();

        // Method 1: Direct substring (first 35 chars)
        const subLen = Math.min(35, qLow.length);
        if (lineLow.includes(qLow.substring(0, subLen))) {
          questionPositions.push({ lineIdx: li, qIdx: qi });
          break;
        }

        // Method 2: Significant word matching (4+ char words)
        const qWords = qLow.match(/\b[a-z]{4,}\b/g) || [];
        if (qWords.length >= 3) {
          const matchCount = qWords.filter(w => lineLow.includes(w)).length;
          if (matchCount / qWords.length >= 0.65) {
            questionPositions.push({ lineIdx: li, qIdx: qi });
            break;
          }
        }
      }
    }

    questionPositions.sort((a, b) => a.lineIdx - b.lineIdx);

    if (questionPositions.length > 0) {
      for (let i = 0; i < questionPositions.length; i++) {
        const startLine = questionPositions[i].lineIdx + 1;
        const endLine = i < questionPositions.length - 1
          ? questionPositions[i + 1].lineIdx
          : lines.length;
        const raw = lines.slice(startLine, endLine).join("\n");
        answers[questionPositions[i].qIdx] = cleanRufusAnswer(raw);
      }
    } else {
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
      paragraphs.forEach((p, i) => {
        if (i < answers.length) answers[i] = cleanRufusAnswer(p);
      });
    }

    return answers;
  };

  // ── Parse Phase 1 bulk input ──────────────────────────────

  const parsePhase1Bulk = useCallback(() => {
    const text = phase1Bulk.trim();
    if (!text) return;

    // First try Q1/A1 label patterns
    const lines = text.split(/\n/).filter((l) => l.trim());
    const labelAnswers: string[] = ["", "", "", "", ""];
    let currentQ = -1;
    let buffer = "";
    let foundLabels = false;

    for (const line of lines) {
      const qMatch = line.match(/^(?:Q|Question)\s*(\d)/i);
      const aMatch = line.match(/^(?:A|Answer)\s*(\d)/i);

      if (qMatch) {
        if (currentQ >= 0 && buffer.trim()) labelAnswers[currentQ] = buffer.trim();
        currentQ = parseInt(qMatch[1]) - 1;
        buffer = "";
        foundLabels = true;
        continue;
      }
      if (aMatch) {
        if (currentQ >= 0 && buffer.trim()) labelAnswers[currentQ] = buffer.trim();
        currentQ = parseInt(aMatch[1]) - 1;
        buffer = line.replace(/^(?:A|Answer)\s*\d[.:]\s*/i, "");
        foundLabels = true;
        continue;
      }
      buffer += (buffer ? "\n" : "") + line;
    }
    if (currentQ >= 0 && buffer.trim()) labelAnswers[currentQ] = buffer.trim();

    if (foundLabels && labelAnswers.some(a => a)) {
      setPhase1Answers(labelAnswers.map(a => cleanRufusAnswer(a)));
    } else {
      setPhase1Answers(parseRufusBulk(text, PHASE1_QUESTIONS));
    }
    setCompletedSteps(prev => new Set([...prev, "phase1_display", "phase1_input"]));
    setStep("phase1_confirm");
  }, [phase1Bulk]);

  // ── Generate Phase 2 questions via Claude ─────────────────

  const generatePhase2Questions = useCallback(async (answersOverride?: string[]) => {
    const p1Answers = answersOverride ?? phase1Answers;
    setIsGeneratingQ(true);
    setAiError("");
    setAiStartTime(Date.now());

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch("/api/seo/claude/rufus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action: "generate_phase2",
            phase1: PHASE1_QUESTIONS.map((q, i) => ({ question: q, answer: p1Answers[i] })),
            brandName: parentAsin || "Product",
            productName: parentAsin || "Product",
            guidelines: guidelinesText,
          }),
        });
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "Alexa for Shopping question generation timed out. Please try again."
          : "Network error during Alexa for Shopping generation. Check your connection and try again.");
      } finally { clearTimeout(timer); }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setPhase2Questions(data.questions);
      setPhase2Answers(new Array(data.questions.length).fill(""));
      setGenUsage(data.usage);
      setCompletedSteps(prev => new Set([...prev, "phase1_display", "phase1_input", "phase1_confirm"]));
      setStep("phase2_display");
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingQ(false);
    }
  }, [phase1Answers]);

  // ── Parse Phase 2 bulk input ──────────────────────────────

  const parsePhase2Bulk = useCallback(() => {
    const text = phase2Bulk.trim();
    if (!text) return;
    setPhase2Answers(parseRufusBulk(text, phase2Questions));
    setCompletedSteps(prev => new Set([...prev, "phase2_display", "phase2_input"]));
    setStep("phase2_confirm");
  }, [phase2Bulk, phase2Questions]);

  // ── AI answer mapping ─────────────────────────────────────
  // Alexa for Shopping replies vary in structure, so Claude maps the pasted
  // text onto the questions (verbatim). On failure we fall back to the regex
  // parser and stop on the Confirm step so the mapping can be checked.

  const mapAnswersWithAI = async (questions: string[], raw: string): Promise<string[] | null> => {
    try {
      const res = await fetch("/api/seo/claude/rufus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "map_answers", questions, raw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.answers)) return null;
      return data.answers as string[];
    } catch {
      return null;
    }
  };

  const mapPhase1AndContinue = async () => {
    const text = phase1Bulk.trim();
    if (!text) return;
    setIsMapping(true);
    setAiError("");
    const answers = await mapAnswersWithAI(PHASE1_QUESTIONS, text);
    setIsMapping(false);
    if (!answers) {
      parsePhase1Bulk();
      setAiError("AI mapping failed — used the basic parser instead. Check the answers below before continuing.");
      return;
    }
    const cleaned = answers.map((a) => cleanRufusAnswer(a));
    setPhase1Answers(cleaned);
    setCompletedSteps(prev => new Set([...prev, "phase1_display", "phase1_input", "phase1_confirm"]));
    setStep("phase1_confirm");
    await generatePhase2Questions(cleaned);
  };

  const mapPhase2AndContinue = async () => {
    const text = phase2Bulk.split("---BATCH---").map((t) => t.trim()).filter(Boolean).join("\n\n--- next batch ---\n\n");
    if (!text) return;
    setIsMapping(true);
    setAiError("");
    const answers = await mapAnswersWithAI(phase2Questions, text);
    setIsMapping(false);
    if (!answers) {
      parsePhase2Bulk();
      setAiError("AI mapping failed — used the basic parser instead. Check the answers below before continuing.");
      return;
    }
    const cleaned = answers.map((a) => cleanRufusAnswer(a));
    setPhase2Answers(cleaned);
    setCompletedSteps(prev => new Set([...prev, "phase2_display", "phase2_input", "phase2_confirm"]));
    setStep("phase2_confirm");
    await runAnalysis(cleaned);
  };

  // ── Run Final Analysis ────────────────────────────────────

  const runAnalysis = useCallback(async (phase2Override?: string[]) => {
    const p2Answers = phase2Override ?? phase2Answers;
    setIsRunningAI(true);
    setAiError("");
    setAiStartTime(Date.now());
    setAiUsage(null);

    const allQA: QAPair[] = [
      ...PHASE1_QUESTIONS.map((q, i) => ({ question: q, answer: phase1Answers[i] })),
      ...phase2Questions.map((q, i) => ({ question: q, answer: p2Answers[i] })),
    ];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 280_000);
      let res: Response;
      try {
        res = await fetch("/api/seo/claude/rufus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action: "analyze",
            guidelines: guidelinesText,
            allQA,
            brandName: parentAsin || "Product",
            productName: parentAsin || "Product",
          }),
        });
      } catch (fetchErr: unknown) {
        throw new Error(fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "Alexa for Shopping analysis timed out. Please try again."
          : "Network error during Alexa for Shopping analysis. Check your connection and try again.");
      } finally { clearTimeout(timer); }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API ${res.status}`);
      }
      const data = await res.json();
      setAnalyzedRows(data.rows);
      setAiUsage(data.usage);
      setCompletedSteps(prev => new Set([...prev, "phase1_display", "phase1_input", "phase1_confirm", "phase2_display", "phase2_input", "phase2_confirm"]));
      setStep("review");
      // Auto-save so data persists if user navigates away
      try {
        await fetch(`/api/seo/projects/${projectId}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "s4_rufus_draft", data: { analyzedRows: data.rows } }),
        });
      } catch (err) {
        console.error("[S4 Alexa for Shopping] Auto-save draft failed:", err);
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunningAI(false);
    }
  }, [phase1Answers, phase2Questions, phase2Answers]);

  // ── Download CSV ──────────────────────────────────────────

  const downloadCSV = useCallback(() => {
    const headers = ["ASIN", "RufusQuestion", "RufusAnswer", "RufusQuestionCategory", "RufusInsightType", "RufusPrimaryObjectionAddressed", "RufusPrimaryDesireAddressed", "RufusCOSMORelationship", "RufusUsageContext", "RufusNotes"];
    const rows = analyzedRows.map((r) =>
      headers.map((h) => {
        const val = String((r as any)[h] || "");
        return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = seoExportFilename(getProjectState(projectId).name, "Alexa_for_Shopping");
    a.click();
    URL.revokeObjectURL(url);
  }, [analyzedRows]);

  // ── Build Phase 2 paste blocks (≤496 chars) ──────────────

  const phase2Batches: string[][] = [];
  if (phase2Questions.length > 0) {
    let currentBatch: string[] = [];
    let currentLen = 0;
    for (const q of phase2Questions) {
      const newLen = currentLen + (currentBatch.length > 0 ? 1 : 0) + q.length;
      if (newLen > 496 && currentBatch.length > 0) {
        phase2Batches.push(currentBatch);
        currentBatch = [q];
        currentLen = q.length;
      } else {
        currentBatch.push(q);
        currentLen = newLen;
      }
    }
    if (currentBatch.length > 0) phase2Batches.push(currentBatch);
  }

  // ── Section header (must be before any early return) ─────

  useSectionHeader({
    title: "Alexa for Shopping Optimization",
    subtitle: step.startsWith("phase1") ? "Phase 1 — Foundational Questions" : step.startsWith("phase2") ? "Phase 2 — Strategic Questions" : step === "analysis" ? "Running Analysis" : step === "review" ? "Review Q&A Insights" : step === "approved" ? "Alexa for Shopping Approved" : "Alexa for Shopping",
    steps: RUFUS_STEPS,
    currentStep: step,
    onStepClick: (key) => setStep(key as RufusStep),
    completedSteps,
    isApproved,
  });

  if (loadingState) {
    return (
      <div className="max-w-4xl flex items-center gap-3 py-10 text-muted-foreground text-sm">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        Loading Alexa for Shopping data…
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      {/* ── PHASE 1: Display paste block ── */}
      {step === "phase1_display" && (
        <div>
          <div className="mb-4 rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <p className="mb-3 text-sm text-muted-foreground">
              Copy the block below and paste it into the <span className="font-semibold text-foreground">Alexa for Shopping chat</span> for your Parent ASIN. Then paste the responses back here.
            </p>

            {/* Parent ASIN link */}
            <div className="mb-3 flex items-center gap-2 rounded-[18px] border border-brand-700/20 bg-brand-950/10 px-4 py-2.5">
              <span className="text-[10px] font-bold text-muted-foreground">Parent ASIN:</span>
              {parentAsin ? (
                <>
                  <a
                    href={parentAsin.amazon_url || `https://www.amazon.com/dp/${parentAsin.asin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-brand-400 hover:text-brand-300 underline underline-offset-2"
                  >
                    {parentAsin.asin}
                  </a>
                  <span className="text-[10px] text-muted-foreground/60">← Open in Amazon, then ask Alexa for Shopping</span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground/60 italic">Not set — complete S1 Intake first</span>
              )}
            </div>

            {/* Paste block */}
            <div className="relative rounded-[18px] border border-brand-700/30 bg-surface-0 p-4">
              <pre className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap font-mono">{PHASE1_PASTE_BLOCK}</pre>
              <button
                onClick={copyPasteBlock}
                className="inline-flex h-9 items-center justify-center absolute top-2 right-2 rounded-full bg-brand-500/20 px-2.5 text-[10px] font-bold text-brand-400 hover:bg-brand-500/30"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
              <div className="mt-2 text-[10px] text-muted-foreground/60">
                {PHASE1_PASTE_BLOCK.length} characters (max 496)
              </div>
            </div>
          </div>

          <button onClick={() => setStep("phase1_input")} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">
            I Have the Alexa for Shopping Responses →
          </button>
        </div>
      )}

      {/* ── PHASE 1: Input answers ── */}
      {step === "phase1_input" && (
        <div>
          <div className="mb-4 rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <p className="mb-3 text-sm text-muted-foreground">
              Paste all 5 Alexa for Shopping responses below — any format. AI maps each answer to its question, then creates the Phase 2 questions.
            </p>
            <textarea
              value={phase1Bulk}
              onChange={(e) => setPhase1Bulk(e.target.value)}
              rows={12}
              placeholder={"Q1: What is this product for?\nA1: ...\n\nQ2: What do people like about this product?\nA2: ..."}
              className="w-full rounded-[18px] border border-surface-4 bg-surface-0 px-4 py-3 text-xs leading-relaxed text-foreground/80 placeholder:text-muted-foreground/40 focus:border-brand-700 focus:outline-none resize-none font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setStep("phase1_display")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Back</button>
            <button onClick={mapPhase1AndContinue} disabled={!phase1Bulk.trim() || isMapping || isGeneratingQ} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover disabled:opacity-50">
              {isMapping ? "Mapping answers…" : isGeneratingQ ? "Creating Phase 2 questions…" : "Map Answers & Create Phase 2 Questions →"}
            </button>
          </div>
        </div>
      )}

      {/* ── PHASE 1: Confirm mapping ── */}
      {step === "phase1_confirm" && (
        <div>
          <div className="mb-4 rounded-[18px] border border-brand-700/20 bg-brand-950/10 p-5">
            <div className="mb-3 text-sm font-bold text-brand-400">Phase 1 Auto-Mapping Confirmation</div>
            <div className="space-y-3">
              {PHASE1_QUESTIONS.map((q, i) => (
                <div key={i} className="rounded-[18px] border border-surface-4 bg-surface-1 p-3">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">Q{i + 1}: {q}</div>
                  <textarea
                    value={phase1Answers[i]}
                    onChange={(e) => {
                      const updated = [...phase1Answers];
                      updated[i] = e.target.value;
                      setPhase1Answers(updated);
                    }}
                    rows={3}
                    className="w-full rounded-[18px] border border-surface-4 bg-surface-0 px-3 py-2 text-xs text-foreground/80 focus:border-brand-700 focus:outline-none resize-none"
                  />
                  {!phase1Answers[i].trim() && (
                    <div className="mt-1 text-[9px] font-bold text-accent-red">Missing answer</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setStep("phase1_input")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Back</button>
<AIGeneratingButton
              isGenerating={isGeneratingQ}
              onClick={() => generatePhase2Questions()}
              label="Generate Phase 2 Questions"
              disabled={phase1Answers.some((a) => !a.trim()) || isGeneratingQ}
            />
            <button
              onClick={() => {
                // Skip Phase 2 AI — go straight to manual Phase 2 with placeholder questions
                setPhase2Questions([
                  "What ingredients does this product contain?",
                  "How quickly does this product work?",
                  "Is this product suitable for sensitive skin?",
                  "What age groups use this product most?",
                  "How does the packaging protect the product?",
                  "Is this product used daily or as needed?",
                  "What situations trigger a purchase of this product?",
                  "Does this product replace any home remedies?",
                ]);
                setPhase2Answers(new Array(8).fill(""));
                setCompletedSteps(prev => new Set([...prev, "phase1_display", "phase1_input", "phase1_confirm"]));
      setStep("phase2_display");
              }}
              disabled={phase1Answers.some((a) => !a.trim()) || isGeneratingQ}
              className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              Skip AI → Use Default Questions
            </button>
            <AICostTracker isRunning={isGeneratingQ} usage={genUsage} startTime={aiStartTime} error={aiError} />
          </div>
          {aiError && !isGeneratingQ && (
            <div className="mt-3 rounded-[18px] border border-red-900/50 bg-red-950/30 p-3 text-xs text-accent-red">{aiError}</div>
          )}
        </div>
      )}

      {/* ── PHASE 2: Display questions + paste blocks ── */}
      {step === "phase2_display" && (
        <div>
          <div className="mb-4 rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <div className="mb-3 text-sm font-bold text-foreground">
              {phase2Questions.length} Strategic Questions Generated
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Copy each batch below and paste into Alexa for Shopping. Then paste all responses back.
            </p>

            {phase2Batches.map((batch, bi) => {
              const blockText = batch.join("\n");
              return (
                <div key={bi} className="mb-3 rounded-[18px] border border-surface-4 bg-surface-0 p-4 relative">
                  <div className="text-[10px] font-bold text-muted-foreground mb-2">
                    Batch {bi + 1} — {blockText.length} chars
                    {blockText.length > 496 && <span className="ml-2 text-accent-red">EXCEEDS 496 LIMIT</span>}
                  </div>
                  <pre className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap font-mono">{blockText}</pre>
                  <button
                    onClick={() => { navigator.clipboard.writeText(blockText); }}
                    className="inline-flex h-9 items-center justify-center absolute top-2 right-2 rounded-full bg-brand-500/20 px-2.5 text-[10px] font-bold text-brand-400 hover:bg-brand-500/30"
                  >
                    Copy
                  </button>
                </div>
              );
            })}
          </div>

          <button onClick={() => setStep("phase2_input")} className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">
            I Have the Alexa for Shopping Responses →
          </button>
        </div>
      )}

      {/* ── PHASE 2: Input answers ── */}
      {step === "phase2_input" && (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            {phase2Batches.length} batch{phase2Batches.length !== 1 ? "es" : ""} — paste Alexa for Shopping responses for each batch below.
          </p>

          <div className="space-y-4 mb-4">
            {phase2Batches.map((batch, bi) => {
              const isFilled = !!(phase2Bulk.split("---BATCH---")[bi]?.trim());
              return (
                <div key={bi} className={`rounded-[18px] border p-4 space-y-3 ${isFilled ? "border-accent-green/20 bg-accent-green/5" : "border-surface-4 bg-surface-1"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex size-5 items-center justify-center rounded-full text-[9px] font-extrabold ${isFilled ? "bg-accent-green/20 text-accent-green" : "bg-brand-500/15 text-brand-400"}`}>
                      {isFilled ? "✓" : bi + 1}
                    </span>
                    <span className="text-xs font-bold text-foreground/80">Batch {bi + 1}</span>
                    <span className="text-[10px] text-muted-foreground/60">{batch.length} question{batch.length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Questions reference */}
                  <div className="rounded-[18px] border border-surface-4 bg-surface-0 px-3 py-2 space-y-1">
                    {batch.map((q, qi) => {
                      const globalIdx = phase2Batches.slice(0, bi).reduce((n, b) => n + b.length, 0) + qi;
                      return (
                        <div key={qi} className="flex items-start gap-2">
                          <span className="shrink-0 text-[9px] font-bold text-muted-foreground/60 mt-0.5">Q{globalIdx + 6}</span>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{q}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* One textarea for the whole batch */}
                  <textarea
                    value={phase2Bulk.split("---BATCH---")[bi] || ""}
                    onChange={(e) => {
                      const parts = phase2Batches.map((_, i) => phase2Bulk.split("---BATCH---")[i] || "");
                      parts[bi] = e.target.value;
                      setPhase2Bulk(parts.join("---BATCH---"));
                    }}
                    rows={5}
                    placeholder={`Paste Alexa for Shopping responses for Batch ${bi + 1}…`}
                    className="w-full rounded-[18px] border border-surface-4 bg-surface-0 px-3 py-2 text-xs leading-relaxed text-foreground/80 placeholder:text-muted-foreground/60 focus:border-brand-700 focus:outline-none resize-none"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setStep("phase2_display")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Back</button>
            <button
              onClick={mapPhase2AndContinue}
              disabled={!phase2Bulk.trim() || isMapping || isRunningAI}
              className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {isMapping ? "Mapping answers…" : isRunningAI ? "Running final analysis…" : "Map Answers & Run Final Analysis →"}
            </button>
          </div>
        </div>
      )}

      {/* ── PHASE 2: Confirm ── */}
      {step === "phase2_confirm" && (
        <div>
          <div className="mb-4 rounded-[18px] border border-surface-4 bg-surface-1 p-5">
            <div className="mb-3 text-sm font-bold text-foreground">Phase 2 Answer Confirmation</div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {phase2Questions.map((q, i) => (
                <div key={i} className="rounded-[18px] border border-surface-4 bg-surface-0 p-3">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">Q{i + 6}: {q}</div>
                  <textarea
                    value={phase2Answers[i]}
                    onChange={(e) => {
                      const updated = [...phase2Answers];
                      updated[i] = e.target.value;
                      setPhase2Answers(updated);
                    }}
                    rows={2}
                    className="w-full rounded-[18px] border border-surface-4 bg-surface-0 px-3 py-2 text-xs text-foreground/80 focus:border-brand-700 focus:outline-none resize-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setStep("phase2_input")} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">Back</button>
<AIGeneratingButton
              isGenerating={isRunningAI}
              onClick={() => runAnalysis()}
              label="Run Final Analysis"
              disabled={isRunningAI}
            />
            <button
              onClick={() => {
                // Skip AI — create placeholder Q&A insight rows
                const allQA = [
                  ...PHASE1_QUESTIONS.map((q, i) => ({ question: q, answer: phase1Answers[i] })),
                  ...phase2Questions.map((q, i) => ({ question: q, answer: phase2Answers[i] })),
                ];
                const skipped = allQA.map((qa) => ({
                  ASIN: "ParentASIN",
                  RufusQuestion: qa.question,
                  RufusAnswer: qa.answer,
                  RufusQuestionCategory: "Not analyzed",
                  RufusInsightType: "Not analyzed",
                  RufusPrimaryObjectionAddressed: "AI analysis skipped",
                  RufusPrimaryDesireAddressed: "AI analysis skipped",
                  RufusCOSMORelationship: "Not analyzed",
                  RufusUsageContext: "Not analyzed",
                  RufusNotes: "AI analysis skipped",
                }));
                setAnalyzedRows(skipped);
                setCompletedSteps(prev => new Set([...prev, "phase1_display", "phase1_input", "phase1_confirm", "phase2_display", "phase2_input", "phase2_confirm"]));
      setStep("review");
              }}
              disabled={isRunningAI}
              className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              Skip AI → Approve Raw
            </button>
            <AICostTracker isRunning={isRunningAI} usage={aiUsage} startTime={aiStartTime} error={aiError} />
          </div>
        </div>
      )}

      {/* ── Review Q&A insights ── */}
      {step === "review" && analyzedRows.length > 0 && (
        <div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <StatCard label="Total Q&A Pairs" value={analyzedRows.length} />
            <StatCard label="Phase 1" value={5} />
            <StatCard label="Phase 2" value={analyzedRows.length - 5} />
          </div>

          <div className="mb-4 space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {analyzedRows.map((r, i) => (
              <div key={i} className="rounded-[18px] border border-surface-4 bg-surface-1 p-4">
                <div className="flex items-start gap-3 mb-2">
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${i < 5 ? "bg-brand-500/20 text-brand-400" : "bg-accent-blue/20 text-accent-blue"}`}>
                    {i < 5 ? "P1" : "P2"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground mb-1">{r.RufusQuestion}</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed mb-2">{r.RufusAnswer}</div>
                    <div className="flex flex-wrap gap-1">
                      <Tag label={r.RufusQuestionCategory} />
                      <Tag label={r.RufusInsightType} />
                      <Tag label={r.RufusCOSMORelationship} color="blue" />
                      <Tag label={r.RufusUsageContext} color="green" />
                    </div>
                  </div>
                </div>
                {r.RufusNotes && r.RufusNotes !== "None" && (
                  <div className="mt-2 text-[10px] text-muted-foreground border-t border-surface-4 pt-2">
                    <span className="font-bold">Notes:</span> {r.RufusNotes}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={downloadCSV} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">
              Download Alexa for Shopping CSV
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/seo/projects/${projectId}/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      phase: "s4_rufus",
                      data: {
                        analyzedRows: analyzedRows,
                      },
                    }),
                  });
                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `Save failed: ${res.status}`);
                  }
                  markPhaseApproved(projectId, "s4");
                  setCompletedSteps(new Set(RUFUS_STEPS.map(s => s.key)));
                  setIsApproved(true);
                  setStep("approved");
                } catch (e: unknown) {
                  alert(`S4 approve failed: ${e instanceof Error ? e.message : String(e)}`);
                }
              }}
              className="inline-flex h-9 items-center justify-center ml-auto rounded-full bg-accent-green px-4 text-[13px] font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S4 — Unlock COSMO (S5)
            </button>
          </div>
        </div>
      )}

      {/* ── Approved ── */}
      {step === "approved" && (
        <div className="rounded-[18px] border border-accent-green/30 bg-accent-green/5 p-6 text-center">
          <div className="mb-2 text-lg font-extrabold text-accent-green">S4 Alexa for Shopping — Approved ✓</div>
          <p className="text-sm text-muted-foreground mb-4">{analyzedRows.length} Q&A pairs analyzed with COSMO relationships and buyer insights.</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={downloadCSV} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-4 text-[13px] font-medium text-muted-foreground hover:bg-surface-2">
              Download Alexa for Shopping CSV
            </button>
            <a href="#s5" className="inline-flex h-9 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-bold text-white hover:bg-brand-hover">
              Continue → S5 COSMO
            </a>
            <button onClick={() => { setStep("review"); }} className="inline-flex h-9 items-center justify-center rounded-full border border-surface-4 px-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground/80">
              Unlock for Editing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] border border-surface-4 bg-surface-1 px-4 py-3">
      <div className="text-lg font-extrabold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Tag({ label, color = "default" }: { label: string; color?: string }) {
  if (!label || label === "None") return null;
  const c = color === "blue" ? "bg-accent-blue/15 text-accent-blue" : color === "green" ? "bg-accent-green/15 text-accent-green" : "bg-surface-3 text-muted-foreground";
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${c}`}>{label}</span>;
}
