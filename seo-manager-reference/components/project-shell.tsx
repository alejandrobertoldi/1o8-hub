/* eslint-disable react-doctor/nextjs-no-a-element */
/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
  phase: "s1" | "s2" | "s3" | "s4" | "s5" | "s6"
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

function getActiveSectionFromPath(pathname: string): string {
  const segments = pathname.split("/");
  const last = segments[segments.length - 1];
  const known = ["intake", "keywords", "reviews", "rufus", "cosmo", "seo"];
  return known.includes(last) ? last : "intake";
}

function deriveCurrentPhase(state: ProjectState): string {
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

const CHIP_PHASES = [
  { id: "S1", label: "Intake", path: "intake" },
  { id: "S2", label: "Keywords", path: "keywords" },
  { id: "S3", label: "Reviews", path: "reviews" },
  { id: "S4", label: "Rufus", path: "rufus" },
  { id: "S5", label: "COSMO", path: "cosmo" },
  { id: "S6", label: "SEO", path: "seo" },
];

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
    fetch(`/api/projects/${projectId}`)
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

  const getChipStatus = (phaseId: string): string => {
    const key = phaseId.toLowerCase();
    if (approvals[`${key}_approved_at` as keyof typeof approvals]) return "approved";
    if (phaseId === currentPhase) return "active";
    const phaseIdx = CHIP_PHASES.findIndex(p => p.id === phaseId);
    const currentIdx = CHIP_PHASES.findIndex(p => p.id === currentPhase);
    if (phaseIdx < currentIdx) return "completed";
    return "locked";
  };

  const getChipClasses = (status: string, isActive: boolean) => {
    if (isActive) return "bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30";
    switch (status) {
      case "approved": return "bg-accent-green/10 text-accent-green/80 hover:bg-accent-green/15";
      case "completed": return "bg-surface-3 text-zinc-400 hover:text-zinc-300";
      case "active": return "bg-brand-500/10 text-zinc-400 hover:text-brand-400";
      default: return "bg-surface-2 text-zinc-700 cursor-not-allowed pointer-events-none";
    }
  };

  const getChipDotClasses = (status: string, isActive: boolean) => {
    if (isActive) return "bg-brand-500 text-surface-0";
    switch (status) {
      case "approved": return "bg-accent-green/20 text-accent-green";
      case "completed":
      case "active": return "bg-surface-5 text-zinc-400";
      default: return "bg-surface-4 text-zinc-700";
    }
  };

  return (
    <div className="flex min-h-screen overflow-x-hidden w-full">
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-[200px] flex-col border-r border-surface-4 bg-surface-1/80 backdrop-blur-sm">
        <a href="/" className="flex items-center gap-3 border-b border-surface-4 px-4 py-3 hover:bg-surface-2 transition-colors group">
          <img src="/logo.png" alt="1o8" width={32} height={32} className="rounded-md shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-brand-500 truncate group-hover:text-brand-400">
              {mounted ? projectState.brand_name : "—"}
            </div>
            <div className="text-[10px] text-zinc-600 truncate">
              {mounted ? projectState.name : "Loading…"}
            </div>
          </div>
        </a>
        <PhaseTracker
          projectId={projectId}
          currentPhase={currentPhase}
          approvals={approvals}
          activeSection={activeSection}
        />
      </aside>
      <div className="ml-[200px] min-w-0 flex-1 overflow-x-hidden">
        {/* Sticky header + chip nav */}
        <header className="sticky top-0 z-20 border-b border-surface-4 bg-surface-0/95 backdrop-blur-md">
          <div className="flex items-center justify-between px-8 py-2.5">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="1o8" width={24} height={24} className="rounded" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-zinc-200">1o8 SEO Manager</span>
                <span className="text-[10px] text-zinc-600">RUFUS &amp; COSMO</span>
              </div>
            </div>
            {mounted && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-brand-500">{projectState.brand_name}</span>
                <span className="text-[10px] text-zinc-600">&middot;</span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[180px]">{projectState.name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-8 pb-2.5">
            {CHIP_PHASES.map(phase => {
              const status = getChipStatus(phase.id);
              const isActive = phase.path === activeSection;
              const isLocked = status === "locked";
              return (
                <Link
                  key={phase.id}
                  href={isLocked ? "#" : `/projects/${projectId}/${phase.path}`}
                  onClick={e => isLocked && e.preventDefault()}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all",
                    getChipClasses(status, isActive)
                  )}
                >
                  <span className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[8px] font-extrabold shrink-0",
                    getChipDotClasses(status, isActive)
                  )}>
                    {status === "approved" ? "\u2713" : phase.id.replace("S", "")}
                  </span>
                  {phase.label}
                </Link>
              );
            })}
          </div>
        </header>
        {/* Page content */}
        <div className="px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
