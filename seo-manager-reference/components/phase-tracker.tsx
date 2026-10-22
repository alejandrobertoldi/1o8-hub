"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface PhaseInfo {
  id: string;
  label: string;
  path: string;
  description: string;
}

const PHASES: PhaseInfo[] = [
  { id: "S1", label: "Intake", path: "intake", description: "Product data & brand guidelines" },
  { id: "S2", label: "Keywords", path: "keywords", description: "Cerebro analysis & tiering" },
  { id: "S3", label: "Reviews", path: "reviews", description: "Sentiment & buyer psychology" },
  { id: "S4", label: "Rufus", path: "rufus", description: "AI intelligence gathering" },
  { id: "S5", label: "COSMO", path: "cosmo", description: "Semantic mapping" },
  { id: "S6", label: "SEO Content", path: "seo", description: "Content generation + compliance" },
];

type PhaseStatus = "locked" | "active" | "completed" | "approved";

interface PhaseTrackerProps {
  projectId: string;
  currentPhase: string;
  approvals: Record<string, string | null>; // e.g. { S1: "2026-02-20T…" }
  activeSection: string; // current page path segment
}

export default function PhaseTracker({
  projectId,
  currentPhase,
  approvals,
  activeSection,
}: PhaseTrackerProps) {
  const getStatus = (phaseId: string): PhaseStatus => {
    const key = phaseId.toLowerCase() as string;
    if (approvals[`${key}_approved_at`]) return "approved";
    if (phaseId === currentPhase) return "active";
    const phaseIdx = PHASES.findIndex((p) => p.id === phaseId);
    const currentIdx = PHASES.findIndex((p) => p.id === currentPhase);
    if (phaseIdx < currentIdx) return "completed";
    return "locked";
  };

  return (
    <div className="flex flex-col gap-0.5 px-2 py-3">
      <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
        Workflow
      </div>
      {PHASES.map((phase, i) => {
        const status = getStatus(phase.id);
        const isActive = phase.path === activeSection;
        const isLocked = status === "locked";

        return (
          <Link
            key={phase.id}
            href={isLocked ? "#" : `/projects/${projectId}/${phase.path}`}
            className={cn(
              "group relative flex items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-all",
              isActive && "bg-surface-3",
              isLocked
                ? "cursor-not-allowed opacity-40 pointer-events-none"
                : "hover:bg-surface-3"
            )}
            onClick={(e) => isLocked && e.preventDefault()}
          >
            {/* Status dot + line */}
            <div className="relative flex flex-col items-center pt-0.5">
              <div
                className={cn(
                  "size-3 rounded-full border-2 transition-colors",
                  status === "approved" && "border-accent-green bg-accent-green",
                  status === "completed" && "border-accent-green bg-transparent",
                  status === "active" && "border-brand-500 bg-brand-500",
                  status === "locked" && "border-surface-5 bg-transparent"
                )}
              >
                {status === "approved" && (
                  <svg className="h-full w-full text-surface-0" viewBox="0 0 12 12" fill="none">
                    <path d="M3.5 6.5L5 8L8.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              {i < PHASES.length - 1 && (
                <div
                  className={cn(
                    "absolute top-4 h-6 w-px",
                    (status === "approved" || status === "completed")
                      ? "bg-accent-green/30"
                      : "bg-surface-4"
                  )}
                />
              )}
            </div>

            {/* Label */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] font-extrabold",
                    status === "active" && "text-brand-500",
                    status === "approved" && "text-accent-green",
                    status === "completed" && "text-zinc-400",
                    status === "locked" && "text-zinc-600"
                  )}
                >
                  {phase.id}
                </span>
                <span
                  className={cn(
                    "text-[12px] font-semibold",
                    isActive ? "text-zinc-100" : "text-zinc-400",
                    isLocked && "text-zinc-600"
                  )}
                >
                  {phase.label}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-600 leading-tight">
                {phase.description}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
