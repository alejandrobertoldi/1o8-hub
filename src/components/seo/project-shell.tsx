/* eslint-disable react-doctor/no-react19-deprecated-apis */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Section header context ───────────────────────────────────
export interface SectionHeaderConfig {
  title: string;
  subtitle?: string;
  steps: { key: string; label: string }[];
  currentStep: string;
  onStepClick: (key: string) => void;
  completedSteps: Set<string>;
  isApproved?: boolean;
}

// Every phase card registers its sub-steps under its phase id ("S1"…"S6"), so
// the one-page SEO Manager's left menu can list all six at once.
const SectionHeaderCtx = createContext<{
  configs: Record<string, SectionHeaderConfig>;
  setConfig: (phase: string, c: SectionHeaderConfig | null) => void;
}>({ configs: {}, setConfig: () => {} });

/** Which phase the component below is rendered for (set by the phase card). */
export const SeoPhaseCtx = createContext<string>("S1");

export function useSectionHeaders() {
  return useContext(SectionHeaderCtx).configs;
}

export function useSectionHeader(config: SectionHeaderConfig) {
  const { setConfig } = useContext(SectionHeaderCtx);
  const phase = useContext(SeoPhaseCtx);
  const callbackRef = useRef(config.onStepClick);
  callbackRef.current = config.onStepClick;
  const configRef = useRef(config);
  configRef.current = config;

  const stableOnStepClick = useCallback((key: string) => callbackRef.current(key), []);

  // Serialize collections into stable strings to avoid infinite re-render loops
  const completedKey = Array.from(config.completedSteps).toSorted().join(",");
  const stepsKey = config.steps.map(s => s.key).join(",");

  useEffect(() => {
    setConfig(phase, { ...configRef.current, onStepClick: stableOnStepClick });
    return () => setConfig(phase, null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setConfig, phase, stableOnStepClick, config.title, config.subtitle, config.currentStep, completedKey, config.isApproved, stepsKey]);
}

// ── localStorage helpers ─────────────────────────────────────
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
    section_locks: {},
  };
}

export function getProjectState(projectId: string): ProjectState {
  if (typeof window === "undefined") return defaultState(projectId);
  try {
    const raw = localStorage.getItem(`seo_project_state_${projectId}`);
    if (raw) return { ...defaultState(projectId), ...JSON.parse(raw) };
  } catch {}
  return defaultState(projectId);
}

export function saveProjectState(projectId: string, state: Partial<ProjectState>) {
  if (typeof window === "undefined") return;
  const current = getProjectState(projectId);
  localStorage.setItem(`seo_project_state_${projectId}`, JSON.stringify({ ...current, ...state }));
}

export function approvePhase(projectId: string, phase: "s1" | "s2" | "s3" | "s4" | "s5" | "s6") {
  const state = getProjectState(projectId);
  const key = `${phase}_approved_at` as keyof ProjectState;
  if (!state[key]) {
    saveProjectState(projectId, { [key]: new Date().toISOString() });
  }
}

/**
 * Approve a phase AND tell the page right away: the header status, the next phase's lock
 * and the auto-open of the next card all update without a reload (one click per approval).
 */
export function markPhaseApproved(projectId: string, phase: "s1" | "s2" | "s3" | "s4" | "s5" | "s6") {
  approvePhase(projectId, phase);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("project_state_updated"));
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

// ── Phase definitions ────────────────────────────────────────
export const PHASES = [
  { id: "S1", label: "Intake", path: "intake" },
  { id: "S2", label: "Keywords", path: "keywords" },
  { id: "S3", label: "Reviews", path: "reviews" },
  { id: "S4", label: "Alexa for Shopping", path: "rufus" },
  { id: "S5", label: "COSMO", path: "cosmo" },
  { id: "S6", label: "SEO Content", path: "seo" },
];

export type PhaseStatus = "locked" | "active" | "completed" | "approved";

export function phaseStatus(state: ProjectState, phaseId: string, currentPhase: string): PhaseStatus {
  const key = `${phaseId.toLowerCase()}_approved_at` as keyof ProjectState;
  if (state[key]) return "approved";
  if (phaseId === currentPhase) return "active";
  const phaseIdx = PHASES.findIndex((p) => p.id === phaseId);
  const currentIdx = PHASES.findIndex((p) => p.id === currentPhase);
  return phaseIdx < currentIdx ? "completed" : "locked";
}

export function deriveCurrentPhase(state: ProjectState): string {
  const order = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;
  for (let i = order.length - 1; i >= 0; i--) {
    const key = `${order[i]}_approved_at` as keyof ProjectState;
    if (state[key]) {
      const nextIdx = i + 1;
      return nextIdx < order.length ? order[nextIdx].toUpperCase() : "S7";
    }
  }
  return "S1";
}

// ── Project context (read by the one-page SEO Manager) ───────
const ProjectShellCtx = createContext<{
  projectId: string;
  projectState: ProjectState;
  currentPhase: string;
  mounted: boolean;
} | null>(null);

export function useProjectShell() {
  const ctx = useContext(ProjectShellCtx);
  if (!ctx) throw new Error("useProjectShell must be used inside ProjectShell");
  return ctx;
}

// ── Header bar ───────────────────────────────────────────────
/** Which Claude model the SEO AI steps use (admin AI config); hover lists the model per step. */
function AiModelPill() {
  const [data, setData] = useState<{ summary: string; steps: { step: string; label: string; enabled: boolean }[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/seo/ai-models").then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.steps) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!data) return null;
  const detail = data.steps.map((s) => `${s.step}: ${s.enabled ? s.label : "off"}`).join("\n");
  return (
    <span title={`Claude model per SEO step\n${detail}`} aria-label={`AI model: ${data.summary}`}
      className="inline-flex items-center gap-1 rounded-full border border-[#D97757]/40 bg-[#D97757]/10 px-2 py-0.5 text-[10px] font-medium text-[#D97757]">
      {/* Claude clay — the pill names the Claude model the SEO steps use */}
      <span className="font-bold">AI</span>· {data.summary}
    </span>
  );
}

function ProjectHeader({ projectState, mounted }: { projectState: ProjectState; mounted: boolean }) {
  return (
    <div className="sticky -top-6 lg:-top-8 z-30 border-b border-border bg-background px-6 lg:px-10">
      <div className="py-1 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/seo" className="text-[10px] font-bold text-muted-foreground hover:text-foreground/80 transition-colors shrink-0">
            ← SEO Projects
          </Link>
          <span className="text-muted-foreground/30 shrink-0">|</span>
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="text-foreground font-bold">SEO</span><span className="text-brand">Manager</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-foreground">{mounted ? projectState.name : ""}</span>
          {mounted && projectState.brand_name && (
            <span className="text-[10px] text-muted-foreground">{projectState.brand_name}</span>
          )}
          <AiModelPill />
        </div>
      </div>
    </div>
  );
}

// ── ProjectShell ─────────────────────────────────────────────
export default function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [projectState, setProjectState] = useState<ProjectState>(() => defaultState(projectId));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    fetch(`/api/seo/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          const localState = getProjectState(projectId);
          const merged = {
            ...localState,
            name: data.name || localState.name,
            brand_name: data.brand_name || localState.brand_name,
            s1_approved_at: data.s1_approved_at || localState.s1_approved_at,
            s2_approved_at: data.s2_approved_at || localState.s2_approved_at,
            s3_approved_at: data.s3_approved_at || localState.s3_approved_at,
            s4_approved_at: data.s4_approved_at || localState.s4_approved_at,
            s5_approved_at: data.s5_approved_at || localState.s5_approved_at,
            s6_approved_at: data.s6_approved_at || localState.s6_approved_at,
          };
          saveProjectState(projectId, merged);
          setProjectState(merged);
        } else {
          setProjectState(getProjectState(projectId));
        }
      })
      .catch(() => setProjectState(getProjectState(projectId)))
      .finally(() => setMounted(true));
  }, [projectId]);

  useEffect(() => {
    const handler = () => {
      setProjectState({ ...getProjectState(projectId) });
    };
    window.addEventListener("project_state_updated", handler);
    return () => window.removeEventListener("project_state_updated", handler);
  }, [projectId]);

  const currentPhase = mounted ? deriveCurrentPhase(projectState) : "S1";
  const [configs, setConfigs] = useState<Record<string, SectionHeaderConfig>>({});
  const setConfig = useCallback((phase: string, c: SectionHeaderConfig | null) => {
    setConfigs((prev) => {
      const next = { ...prev };
      if (c) next[phase] = c;
      else delete next[phase];
      return next;
    });
  }, []);

  return (
    <ProjectShellCtx.Provider value={{ projectId, projectState, currentPhase, mounted }}>
      <SectionHeaderCtx.Provider value={{ configs, setConfig }}>
        <div className="-mx-6 lg:-mx-10 -mt-6 lg:-mt-8 min-h-[calc(100vh-3.5rem)]">
          <ProjectHeader projectState={projectState} mounted={mounted} />
          <div className="px-6 lg:px-10 pb-6 pt-4">{children}</div>
        </div>
      </SectionHeaderCtx.Provider>
    </ProjectShellCtx.Provider>
  );
}
