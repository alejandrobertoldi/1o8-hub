#!/usr/bin/env bash
# ============================================================
#  1o8 SEO Manager — UI Fixes Install Script
#  Run from the ROOT of your project:  bash install-fixes.sh
# ============================================================

set -e
BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${BLUE}▸ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ── Guard: must run from project root ──────────────────────
[ -f "package.json" ] || fail "Run this script from your project root (where package.json lives)"
grep -q "1o8-seo-manager" package.json || fail "package.json doesn't look like the 1o8-seo-manager project"

log "Creating backup of files that will be replaced..."
BACKUP_DIR=".fix-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/components" "$BACKUP_DIR/app/projects/[id]/keywords" "$BACKUP_DIR/app/projects/[id]"

[ -f "components/phase-tracker.tsx" ]                     && cp "components/phase-tracker.tsx"                     "$BACKUP_DIR/components/"
[ -f "app/projects/[id]/layout.tsx" ]                     && cp "app/projects/[id]/layout.tsx"                     "$BACKUP_DIR/app/projects/[id]/"
[ -f "app/projects/[id]/keywords/page.tsx" ]              && cp "app/projects/[id]/keywords/page.tsx"              "$BACKUP_DIR/app/projects/[id]/keywords/"
[ -f "app/projects/[id]/intake/page.tsx" ]                && cp "app/projects/[id]/intake/page.tsx"                "$BACKUP_DIR/app/projects/[id]/"
[ -f "app/projects/[id]/reviews/page.tsx" ]               && cp "app/projects/[id]/reviews/page.tsx"               "$BACKUP_DIR/app/projects/[id]/"
ok "Backup saved to $BACKUP_DIR"

# ================================================================
#  FILE 1 — components/project-shell.tsx  (NEW FILE)
# ================================================================
log "Writing components/project-shell.tsx..."
cat > "components/project-shell.tsx" << 'SHELL_EOF'
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PhaseTracker from "@/components/phase-tracker";

// ── localStorage helpers ────────────────────────────────────
export function getProjectState(projectId: string): ProjectState {
  if (typeof window === "undefined") return defaultState(projectId);
  try {
    const raw = localStorage.getItem(`project_state_${projectId}`);
    if (raw) return { ...defaultState(projectId), ...JSON.parse(raw) };
  } catch {}
  return defaultState(projectId);
}

export function saveProjectState(projectId: string, state: Partial<ProjectState>) {
  if (typeof window === "undefined") return;
  const current = getProjectState(projectId);
  localStorage.setItem(`project_state_${projectId}`, JSON.stringify({ ...current, ...state }));
}

export function approvePhase(
  projectId: string,
  phase: "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7"
) {
  const state = getProjectState(projectId);
  const key = `${phase}_approved_at` as keyof ProjectState;
  if (!state[key]) {
    saveProjectState(projectId, { [key]: new Date().toISOString() });
  }
}

export function lockSection(projectId: string, sectionKey: string) {
  const state = getProjectState(projectId);
  const locks = { ...(state.section_locks || {}) };
  locks[sectionKey] = new Date().toISOString();
  saveProjectState(projectId, { section_locks: locks });
}

export function isSectionLocked(projectId: string, sectionKey: string): boolean {
  const state = getProjectState(projectId);
  return !!state.section_locks?.[sectionKey];
}

export interface ProjectState {
  id: string;
  name: string;
  brand_name: string;
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
  s7_approved_at: string | null;
  section_locks: Record<string, string>;
}

function defaultState(projectId: string): ProjectState {
  return {
    id: projectId,
    name: "Untitled Project",
    brand_name: "Brand",
    s1_approved_at: null,
    s2_approved_at: null,
    s3_approved_at: null,
    s4_approved_at: null,
    s5_approved_at: null,
    s6_approved_at: null,
    s7_approved_at: null,
    section_locks: {},
  };
}

function getActiveSectionFromPath(pathname: string): string {
  const segments = pathname.split("/");
  const last = segments[segments.length - 1];
  const known = ["intake", "keywords", "reviews", "rufus", "cosmo", "compliance", "seo"];
  return known.includes(last) ? last : "intake";
}

function deriveCurrentPhase(state: ProjectState): string {
  const order = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"] as const;
  for (let i = order.length - 1; i >= 0; i--) {
    const key = `${order[i]}_approved_at` as keyof ProjectState;
    if (state[key]) {
      const nextPhase = order[i + 1];
      return nextPhase ? nextPhase.toUpperCase() : "S7";
    }
  }
  return "S1";
}

export default function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [projectState, setProjectState] = useState<ProjectState>(() =>
    defaultState(projectId)
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const state = getProjectState(projectId);
    setProjectState(state);
    setMounted(true);
  }, [projectId]);

  useEffect(() => {
    const handler = () => {
      const state = getProjectState(projectId);
      setProjectState({ ...state });
    };
    window.addEventListener("project_state_updated", handler);
    return () => window.removeEventListener("project_state_updated", handler);
  }, [projectId]);

  const activeSection = getActiveSectionFromPath(pathname || "");
  const currentPhase = mounted ? deriveCurrentPhase(projectState) : "S1";

  const approvals = {
    s1_approved_at: projectState.s1_approved_at,
    s2_approved_at: projectState.s2_approved_at,
    s3_approved_at: projectState.s3_approved_at,
    s4_approved_at: projectState.s4_approved_at,
    s5_approved_at: projectState.s5_approved_at,
    s6_approved_at: projectState.s6_approved_at,
  };

  return (
    <div className="flex min-h-screen">
      <aside className="fixed left-[220px] top-0 z-30 flex h-screen w-[200px] flex-col border-r border-surface-4 bg-surface-1/80 backdrop-blur-sm">
        <div className="border-b border-surface-4 px-4 py-3">
          <div className="text-[11px] font-bold text-brand-500 truncate">
            {mounted ? projectState.brand_name : "—"}
          </div>
          <div className="text-[10px] text-zinc-600 truncate">
            {mounted ? projectState.name : "Loading…"}
          </div>
        </div>
        <PhaseTracker
          projectId={projectId}
          currentPhase={currentPhase}
          approvals={approvals}
          activeSection={activeSection}
        />
      </aside>
      <div className="ml-[200px] flex-1 px-8 py-6">{children}</div>
    </div>
  );
}
SHELL_EOF
ok "components/project-shell.tsx written"

# ================================================================
#  FILE 2 — app/projects/[id]/layout.tsx  (REPLACE)
# ================================================================
log "Writing app/projects/[id]/layout.tsx..."
cat > "app/projects/[id]/layout.tsx" << 'LAYOUT_EOF'
import ProjectShell from "@/components/project-shell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <ProjectShell projectId={params.id}>
      {children}
    </ProjectShell>
  );
}
LAYOUT_EOF
ok "app/projects/[id]/layout.tsx written"

# ================================================================
#  FILE 3 — components/phase-tracker.tsx  (PATCH)
#  Fix: completed/approved phases never get pointer-events-none
# ================================================================
log "Patching components/phase-tracker.tsx..."
python3 - << 'PYEOF'
import re, sys

path = "components/phase-tracker.tsx"
with open(path) as f:
    src = f.read()

# Fix getStatus key lookup (was using a no-op replace)
src = src.replace(
    'const key = phaseId.toLowerCase().replace("s", "s") as string;',
    'const key = phaseId.toLowerCase() as string;'
)

# Fix locked links to use pointer-events-none so they are truly unclickable
src = src.replace(
    '"cursor-not-allowed opacity-40"',
    '"cursor-not-allowed opacity-40 pointer-events-none"'
)

with open(path, "w") as f:
    f.write(src)

print("phase-tracker.tsx patched")
PYEOF
ok "components/phase-tracker.tsx patched"

# ================================================================
#  FILE 4 — app/projects/[id]/intake/page.tsx  (PATCH)
#  Fix: persist S1 approval + justified text in BaselineField
# ================================================================
log "Patching app/projects/[id]/intake/page.tsx..."
python3 - << 'PYEOF'
path = "app/projects/[id]/intake/page.tsx"
with open(path) as f:
    src = f.read()

# 1. Add imports
old = '''"use client";

import { useState, useCallback } from "react";
import { parseIntakeTab, detectVariationAttributes } from "@/lib/parsers/intake";
import type { IntakeParseResult, IntakeASIN, BrandGuidelinesLock } from "@/lib/types";'''
new = '''"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { parseIntakeTab, detectVariationAttributes } from "@/lib/parsers/intake";
import type { IntakeParseResult, IntakeASIN, BrandGuidelinesLock } from "@/lib/types";
import { approvePhase, saveProjectState, getProjectState } from "@/components/project-shell";'''
src = src.replace(old, new)

# 2. Add useParams hook
old = '''export default function IntakePage() {
  const [step, setStep] = useState<IntakeStep>("upload");'''
new = '''export default function IntakePage() {
  const params = useParams();
  const projectId = params?.id as string;
  const [step, setStep] = useState<IntakeStep>("upload");'''
src = src.replace(old, new)

# 3. Replace the TODO alert with localStorage approval
old = '''                // TODO: Save to Supabase, update project.current_phase = "S2", set s1_approved_at
                alert("S1 Approved! In production, this saves to Supabase and unlocks S2.");'''
new = '''                if (projectId) {
                  saveProjectState(projectId, {
                    id: projectId,
                    name: parseResult?.metadata?.client_name || "Untitled Project",
                    brand_name: parseResult?.metadata?.brand_name || "Brand",
                  });
                  approvePhase(projectId, "s1");
                  window.dispatchEvent(new Event("project_state_updated"));
                }'''
src = src.replace(old, new)

# 4. Fix BaselineField — full text + justify + expand/collapse
old = '''function BaselineField({ label, value, maxLen }: { label: string; value: string | null; maxLen: number }) {
  const len = value?.length || 0;
  const empty = !value || value.trim() === "";
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="w-36 shrink-0 text-[10px] font-medium text-zinc-500 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-xs leading-relaxed ${empty ? "italic text-zinc-700" : "text-zinc-400"}`}>
          {empty ? "Empty" : value!.substring(0, 150)}{!empty && len > 150 ? "..." : ""}
        </div>
      </div>
      <span className={`shrink-0 text-[10px] font-mono ${len > maxLen ? "text-accent-red" : "text-zinc-600"}`}>
        {len}/{maxLen}
      </span>
    </div>
  );
}'''
new = '''function BaselineField({ label, value, maxLen }: { label: string; value: string | null; maxLen: number }) {
  const [expanded, setExpanded] = useState(false);
  const len = value?.length || 0;
  const empty = !value || value.trim() === "";
  const isLong = len > 120;
  const displayText = empty
    ? "Empty"
    : isLong && !expanded
    ? value!.substring(0, 120) + "…"
    : value!;
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-surface-4/50 last:border-0">
      <span className="w-36 shrink-0 text-[10px] font-medium text-zinc-500 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">
        <div
          className={`text-xs leading-relaxed text-justify ${empty ? "italic text-zinc-700" : "text-zinc-400"} ${isLong ? "cursor-pointer hover:text-zinc-300" : ""}`}
          onClick={() => isLong && setExpanded((v) => !v)}
          title={isLong ? (expanded ? "Click to collapse" : "Click to expand") : undefined}
        >
          {displayText}
          {isLong && <span className="ml-1 text-[9px] text-zinc-600">{expanded ? "▲" : "▼"}</span>}
        </div>
      </div>
      <span className={`shrink-0 text-[10px] font-mono ${len > maxLen ? "text-accent-red" : "text-zinc-600"}`}>
        {len}/{maxLen}
      </span>
    </div>
  );
}'''
src = src.replace(old, new)

with open(path, "w") as f:
    f.write(src)
print("intake/page.tsx patched")
PYEOF
ok "app/projects/[id]/intake/page.tsx patched"

# ================================================================
#  FILE 5 — app/projects/[id]/reviews/page.tsx  (PATCH)
#  Fix: persist S3 approval + justified text in DetailRow
# ================================================================
log "Patching app/projects/[id]/reviews/page.tsx..."
python3 - << 'PYEOF'
path = "app/projects/[id]/reviews/page.tsx"
with open(path) as f:
    src = f.read()

# 1. Add imports
old = '''"use client";

import { useState, useCallback, useRef } from "react";
import { parseReviewCSV, type ReviewParseResult, type ParsedReview } from "@/lib/parsers/reviews";
import AICostTracker from "@/components/ai-cost-tracker";'''
new = '''"use client";

import { useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { parseReviewCSV, type ReviewParseResult, type ParsedReview } from "@/lib/parsers/reviews";
import AICostTracker from "@/components/ai-cost-tracker";
import { approvePhase } from "@/components/project-shell";'''
src = src.replace(old, new)

# 2. Add useParams
old = '''export default function ReviewsPage() {
  const [step, setStep] = useState<ReviewsStep>("upload");'''
new = '''export default function ReviewsPage() {
  const params = useParams();
  const projectId = params?.id as string;
  const [step, setStep] = useState<ReviewsStep>("upload");'''
src = src.replace(old, new)

# 3. Wire approval to localStorage
old = '''              onClick={() => setStep("approved")}
              className="ml-auto rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S3 — Unlock Rufus (S4)'''
new = '''              onClick={() => {
                if (projectId) {
                  approvePhase(projectId, "s3");
                  window.dispatchEvent(new Event("project_state_updated"));
                }
                setStep("approved");
              }}
              className="ml-auto rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S3 — Unlock Rufus (S4)'''
src = src.replace(old, new)

# 4. Fix DetailRow — justified text
old = '''function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-[10px] font-bold text-zinc-500">{label}</span>
      <span className="text-[11px] text-zinc-300">{value}</span>
    </div>
  );
}'''
new = '''function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-[10px] font-bold text-zinc-500">{label}</span>
      <span className="text-[11px] text-zinc-300 leading-relaxed text-justify">{value}</span>
    </div>
  );
}'''
src = src.replace(old, new)

with open(path, "w") as f:
    f.write(src)
print("reviews/page.tsx patched")
PYEOF
ok "app/projects/[id]/reviews/page.tsx patched"

# ================================================================
#  FILE 6 — app/projects/[id]/keywords/page.tsx  (FULL REPLACE)
#  Fixes: S7.6 audit lock, red text, 4-col unused keywords,
#         used keywords table, justified text, localStorage persist
# ================================================================
log "Writing app/projects/[id]/keywords/page.tsx..."
cat > "app/projects/[id]/keywords/page.tsx" << 'KEYWORDS_EOF'
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { parseCerebroCSV, type CerebroParseResult } from "@/lib/parsers/cerebro";
import AICostTracker from "@/components/ai-cost-tracker";
import {
  approvePhase,
  saveProjectState,
  getProjectState,
} from "@/components/project-shell";

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

type KeywordsStep = "upload" | "parsed" | "review" | "audit" | "approved";

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compFileRef = useRef<HTMLInputElement>(null);

  // Restore persisted state on mount
  useEffect(() => {
    if (!projectId) return;
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
      const allKeywords = [
        ...clientResult.keywords,
        ...competitorResults.flatMap((r) => r.keywords),
      ];
      const res = await fetch("/api/claude/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: allKeywords,
          brandName: "Dr. Cuddles",
          variationProduct: "ReadyRESCUE",
          variationTheme: "Size",
          competitors: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `API returned ${res.status}`);
      }
      const data = await res.json();
      setTieredKeywords(data.keywords);
      setAiUsage(data.usage);
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
    audit: "S7.6 Keyword Audit",
    approved: "Keywords Approved ✓",
  };

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-500 mb-1">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-500/10 text-[10px]">S2</span>
          Keyword Extraction & Tiering
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-zinc-100">{stepTitle[step]}</h1>
      </div>

      {/* ── Upload ── */}
      {step === "upload" && (
        <div className="rounded-xl border border-surface-4 bg-surface-1 p-5">
          <p className="mb-4 text-sm text-zinc-400">
            Upload the Helium 10 Cerebro CSV export for your{" "}
            <span className="font-semibold text-zinc-200">Parent ASIN</span>.
          </p>
          <input
            ref={fileInputRef} type="file" accept=".csv" onChange={handleClientUpload}
            className="w-full rounded-lg border border-dashed border-surface-5 bg-surface-0 px-4 py-3 text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-brand-500/20 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-400 hover:border-brand-700 cursor-pointer"
          />
          <p className="mt-2 text-[10px] text-zinc-600">
            Supported: Keyword Phrase, Search Volume, Cerebro IQ Score, Competing Products, Title Density, CPR, Position
          </p>
        </div>
      )}

      {/* ── Parsed ── */}
      {step === "parsed" && clientResult && (
        <div>
          <div className="mb-4 grid grid-cols-4 gap-3">
            <StatCard label="Keywords Parsed" value={clientResult.keywords.length} />
            <StatCard label="Total Raw Rows" value={clientResult.totalRaw} />
            <StatCard label="Duplicates Removed" value={clientResult.duplicatesRemoved} color="amber" />
            <StatCard label="Invalid Removed" value={clientResult.invalidRemoved} color="red" />
          </div>
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
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
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
          <div className="flex items-center gap-3">
            <button onClick={() => { setStep("upload"); setClientResult(null); setCompetitorResults([]); }}
              className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">Back</button>
            <button onClick={handleRunAI} disabled={isRunningAI}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-surface-0 hover:bg-brand-400 disabled:opacity-50">
              {isRunningAI
                ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-surface-0 border-t-transparent" />Running AI Tiering...</>
                : <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
                  Run AI Tiering (Claude)
                </>}
            </button>
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
            <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Search keywords..."
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
                }
                setStep("approved");
              }}
              className="ml-auto rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80"
            >
              ✓ Approve S2 — Unlock Reviews (S3)
            </button>
          </div>
        </div>
      )}

      {/* ── S7.6 Audit ── */}
      {step === "audit" && (
        <div>
          {auditLocked && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/5 px-4 py-2.5">
              <svg className="h-4 w-4 text-accent-green" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
              <span className="text-xs font-bold text-accent-green">S7.6 Audit — LOCKED</span>
              <span className="text-[10px] text-zinc-500 ml-1">Results are final.</span>
            </div>
          )}
          {!auditLocked && (
            <div className="mb-5 rounded-xl border border-surface-4 bg-surface-1 p-5">
              <div className="mb-3 text-sm font-bold text-zinc-300">Paste SEO Content for Audit</div>
              <p className="mb-4 text-xs text-zinc-500">Paste generated SEO copy into each field. The audit checks which OUT_KEY keywords appear in final content.</p>
              <div className="grid grid-cols-2 gap-3">
                {SEO_FIELDS.map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-[10px] font-bold text-zinc-500">{label}</label>
                    <textarea
                      value={seoContent[key] || ""}
                      onChange={(e) => setSeoContent((prev) => ({ ...prev, [key]: e.target.value }))}
                      rows={key === "Title" || key.startsWith("Backend") ? 2 : key === "Description" ? 4 : 3}
                      placeholder={`Paste ${label}…`}
                      className="w-full rounded-md border border-surface-4 bg-surface-0 px-3 py-2 text-xs text-zinc-300 placeholder:text-zinc-700 focus:border-brand-700 focus:outline-none resize-y text-justify leading-relaxed"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button onClick={handleRunAudit} disabled={!tieredKeywords.length}
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-surface-0 hover:bg-brand-400 disabled:opacity-40">
                  Run Keyword Audit
                </button>
              </div>
            </div>
          )}

          {auditEntries.length > 0 && (
            <div>
              <div className="mb-4 grid grid-cols-4 gap-3">
                <StatCard label="Total Keywords" value={auditEntries.length} />
                <StatCard label="Keywords Used" value={usedEntries.length} color="green" />
                <StatCard label="Unused" value={auditEntries.length - usedEntries.length} color={auditEntries.length - usedEntries.length > 10 ? "red" : "amber"} />
                <StatCard label="Coverage" value={Math.round((usedEntries.length / auditEntries.length) * 100)}
                  color={usedEntries.length / auditEntries.length >= 0.6 ? "green" : "red"} suffix="%" />
              </div>

              {/* TOP UNUSED — 4 columns by tier */}
              <div className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-200">TOP UNUSED KEYWORDS</span>
                  <span className="text-[10px] text-zinc-600">sorted by search volume · {auditEntries.length - usedEntries.length} unused</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {(["T1","T2","T3","T4"] as const).map((tier) => {
                    const tierStyle: Record<string, string> = {
                      T1: "text-brand-400 border-brand-700/30 bg-brand-950/20",
                      T2: "text-accent-blue border-blue-900/30 bg-blue-950/20",
                      T3: "text-accent-green border-green-900/30 bg-green-950/20",
                      T4: "text-zinc-400 border-surface-5 bg-surface-2",
                    };
                    const tierLabel: Record<string, string> = {
                      T1: "T1 — Title", T2: "T2 — Bullets",
                      T3: "T3 — Description", T4: "T4 — Backend",
                    };
                    const entries = unusedByTier[tier];
                    return (
                      <div key={tier} className={`rounded-xl border p-3 ${tierStyle[tier]}`}>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-extrabold">{tierLabel[tier]}</span>
                          <span className="text-[10px] font-bold opacity-60">{entries.length}</span>
                        </div>
                        {entries.length === 0 ? (
                          <div className="text-[10px] text-zinc-600 italic py-2">All used ✓</div>
                        ) : (
                          <div className="space-y-1 max-h-[320px] overflow-y-auto">
                            {entries.map((e, i) => (
                              <div key={i} className="flex items-start justify-between gap-1 py-0.5 border-b border-white/5 last:border-0">
                                <span className="text-[11px] text-red-400 font-medium leading-tight flex-1">
                                  {e.KeywordText}
                                </span>
                                <span className="shrink-0 text-[9px] font-mono text-zinc-600 pt-0.5">
                                  {e.KeywordSearchVolume >= 1000
                                    ? `${(e.KeywordSearchVolume / 1000).toFixed(1)}k`
                                    : e.KeywordSearchVolume}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* USED KEYWORDS — with tier + locations */}
              <div className="mb-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-200">USED KEYWORDS</span>
                  <span className="text-[10px] text-zinc-600">{usedEntries.length} keywords placed in content</span>
                </div>
                <div className="rounded-xl border border-surface-4 bg-surface-1 overflow-hidden">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-surface-2 z-10">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-zinc-500 w-[220px]">Keyword</th>
                          <th className="px-3 py-2 text-right font-bold text-zinc-500">Volume</th>
                          <th className="px-3 py-2 text-center font-bold text-zinc-500">Tier</th>
                          <th className="px-3 py-2 text-left font-bold text-zinc-500">Placed In</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usedEntries.map((e, i) => (
                          <tr key={i} className="border-t border-surface-4 hover:bg-surface-2/50">
                            <td className="px-3 py-1.5 font-medium text-accent-green max-w-[220px]">
                              <span className="block text-justify leading-relaxed">{e.KeywordText}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                              {e.KeywordSearchVolume.toLocaleString()}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <TierBadge tier={e.KeywordPriorityTier} />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {e.locations.map((loc, j) => (
                                  <span key={j} className="inline-flex items-center rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">
                                    {loc}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {!auditLocked && (
                <div className="flex items-center gap-3">
                  <button onClick={() => setStep("review")} className="rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">
                    Back to OUT_KEY
                  </button>
                  <button onClick={handleLockAudit}
                    className="ml-auto rounded-lg bg-accent-green px-6 py-2.5 text-sm font-bold text-surface-0 hover:bg-accent-green/80">
                    ✓ Lock S7.6 Audit — Results Final
                  </button>
                </div>
              )}
            </div>
          )}

          {!auditEntries.length && !auditLocked && (
            <button onClick={() => setStep("review")} className="mt-4 rounded-lg border border-surface-4 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-surface-2">
              Back to OUT_KEY
            </button>
          )}
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
            <button onClick={() => setStep("audit")}
              className="rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-brand-950">
              {auditLocked ? "View S7.6 Audit →" : "Run S7.6 Keyword Audit →"}
            </button>
            <a href="#" className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-bold text-surface-0 hover:bg-brand-400">
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
KEYWORDS_EOF
ok "app/projects/[id]/keywords/page.tsx written"

# ================================================================
#  DONE
# ================================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  All fixes installed successfully ✓${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Files changed:"
echo "  + components/project-shell.tsx       (NEW)"
echo "  ~ components/phase-tracker.tsx       (patched)"
echo "  ~ app/projects/[id]/layout.tsx       (replaced)"
echo "  ~ app/projects/[id]/intake/page.tsx  (patched)"
echo "  ~ app/projects/[id]/reviews/page.tsx (patched)"
echo "  ~ app/projects/[id]/keywords/page.tsx (replaced)"
echo ""
echo "Backup saved to: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  npm run dev    — start dev server"
echo "  npm run build  — verify production build"
echo ""
echo "To undo all changes:"
echo "  cp $BACKUP_DIR/components/* components/"
echo "  cp $BACKUP_DIR/app/projects/\\[id\\]/*.tsx app/projects/\\[id\\]/"
echo "  cp $BACKUP_DIR/app/projects/\\[id\\]/keywords/*.tsx app/projects/\\[id\\]/keywords/"
