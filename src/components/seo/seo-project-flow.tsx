"use client";

// The one-page SEO Manager: all six phases as stacked, collapsible cards with a
// left menu of phases + sub-steps. Each card renders the phase exactly as its
// old page did (one sub-step at a time); a phase only mounts — and loads its
// data — the first time its card is opened, then stays mounted.

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { Check, ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PHASES,
  SeoPhaseCtx,
  phaseStatus,
  useProjectShell,
  useSectionHeaders,
  type PhaseStatus,
} from "@/components/seo/project-shell";
import { openAfterApproval } from "@/lib/seo/phase-open";
import { POST_S6, postS6Status } from "@/lib/seo/post-s6-phases";

const loading = () => <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
const PHASE_COMPONENTS: Record<string, ComponentType> = {
  S0: dynamic(() => import("./phases/setup-phase"), { ssr: false, loading }),
  S1: dynamic(() => import("./phases/intake-phase"), { ssr: false, loading }),
  S2: dynamic(() => import("./phases/keywords-phase"), { ssr: false, loading }),
  S3: dynamic(() => import("./phases/reviews-phase"), { ssr: false, loading }),
  S4: dynamic(() => import("./phases/rufus-phase"), { ssr: false, loading }),
  S5: dynamic(() => import("./phases/cosmo-phase"), { ssr: false, loading }),
  S6: dynamic(() => import("./phases/seo-phase"), { ssr: false, loading }),
};

/**
 * Sub-step labels for the menu before a phase has mounted. Keys match each
 * phase's own step keys so a click can be replayed once it mounts; after that
 * the phase's live registration (current / completed) takes over.
 */
const STATIC_STEPS: Record<string, { key: string; label: string }[]> = {
  S0: [
    { key: "client", label: "S0.1 Client" },
    { key: "targets", label: "S0.2 Target ASINs" },
    { key: "rules", label: "S0.3 Content Rules" },
    { key: "details", label: "S0.4 Name & Assignee" },
  ],
  S1: [
    { key: "summary", label: "S1.0 Project Summary" },
    { key: "variety-pack", label: "S1.2b Variety Pack Details" },
    { key: "baseline", label: "S1.3 Baseline Analysis" },
    { key: "competitors", label: "S1.4 Competitors" },
    { key: "guidelines", label: "S1.5 Brand Guidelines" },
    { key: "confirm", label: "S1.6 Confirm & Approve" },
  ],
  S2: [
    { key: "upload", label: "S2.1 Get Keywords" },
    { key: "parsed", label: "S2.2 Parsed Data" },
    { key: "review", label: "S2.3 Review Keywords" },
    { key: "approved", label: "S2.4 Approved" },
  ],
  S3: [
    { key: "upload", label: "S3.1 Reviews Source" },
    { key: "parsed", label: "S3.2 Parsed" },
    { key: "review", label: "S3.3 Review Analysis" },
    { key: "approved", label: "S3.4 Approved" },
  ],
  S4: [
    { key: "phase1_display", label: "S4.1 Phase 1 Questions" },
    { key: "phase1_input", label: "S4.2 Phase 1 Answers" },
    { key: "phase1_confirm", label: "S4.3 Phase 1 Confirm" },
    { key: "phase2_display", label: "S4.4 Phase 2 Questions" },
    { key: "phase2_input", label: "S4.5 Phase 2 Answers" },
    { key: "phase2_confirm", label: "S4.6 Phase 2 Confirm" },
    { key: "review", label: "S4.7 Review Q&A Insights" },
    { key: "approved", label: "S4.8 Approved" },
  ],
  S5: [
    { key: "inputs", label: "S5.1 Verify Inputs" },
    { key: "summary", label: "S5.2 Research Summary" },
    { key: "mapping", label: "S5.3 Generate COSMO Map" },
    { key: "review", label: "S5.4 Review COSMO Map" },
    { key: "approved", label: "S5.5 Approved" },
  ],
  S6: [
    { key: "config", label: "S6.1 Configuration" },
    { key: "batch-titles", label: "S6.2 Titles" },
    { key: "batch-bullets", label: "S6.3 Bullets" },
    { key: "batch-description", label: "S6.4 Description" },
    { key: "batch-backend", label: "S6.5 Backend" },
    { key: "audit", label: "S6.6 Audit & Optimize" },
    { key: "aplus-qa", label: "S6.7 Premium A+ Q&A" },
    { key: "final", label: "S6.8 Final SEO Content" },
  ],
};

/** S0 Project Setup (what the New SEO Project wizard chose) comes before the six pipeline phases. */
const FLOW_PHASES = [{ id: "S0", label: "Project Setup", path: "" }, ...PHASES];

const POST_S6_KEYS = new Set<string>(POST_S6.map((p) => p.key));

const STATUS_LABEL: Record<PhaseStatus, string> = {
  approved: "Approved",
  active: "In progress",
  completed: "Completed",
  locked: "Locked",
};

function StatusIcon({ status, index }: { status: PhaseStatus; index: number }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
        status === "approved" && "bg-emerald-500 text-white",
        status === "active" && "bg-brand-solid text-white",
        status === "completed" && "bg-muted text-muted-foreground",
        status === "locked" && "bg-muted text-muted-foreground/60"
      )}
    >
      {status === "approved" ? <Check className="size-3" /> : status === "locked" ? <Lock className="size-2.5" /> : index + 1}
    </span>
  );
}

export default function SeoProjectFlow() {
  const { projectState, currentPhase, mounted } = useProjectShell();
  const configs = useSectionHeaders();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [inView, setInView] = useState("S1");
  const pendingStep = useRef<{ phase: string; key: string } | null>(null);
  const initialized = useRef(false);
  const lastCurrent = useRef("");

  const statusOf = useCallback(
    (id: string): PhaseStatus => (id === "S0" ? "approved" : phaseStatus(projectState, id, currentPhase)),
    [projectState, currentPhase]
  );

  const openPhase = useCallback(
    (id: string, scroll: boolean) => {
      if (statusOf(id) === "locked") return;
      setOpen((prev) => new Set(prev).add(id));
      setLoaded((prev) => new Set(prev).add(id));
      if (scroll) {
        history.replaceState(null, "", `#${id.toLowerCase()}`);
        requestAnimationFrame(() =>
          document.getElementById(id.toLowerCase())?.scrollIntoView({ behavior: "smooth", block: "start" })
        );
      }
    },
    [statusOf]
  );

  // First paint after the project state arrives: open the #sN card, else the current phase.
  useEffect(() => {
    if (!mounted || initialized.current) return;
    initialized.current = true;
    lastCurrent.current = currentPhase; // first load isn't an approval
    const fromHash = /^#s([0-6])$/i.exec(window.location.hash);
    const current = currentPhase === "S7" ? "S6" : currentPhase;
    const target = fromHash && statusOf(`S${fromHash[1]}`) !== "locked" ? `S${fromHash[1]}` : current;
    openPhase(target, !!fromHash);
  }, [mounted, currentPhase, statusOf, openPhase]);

  // In-page links like "Continue → S2" land on /seo/[id]#s2 — follow them.
  useEffect(() => {
    const onHash = () => {
      const m = /^#s([0-6])$/i.exec(window.location.hash);
      if (m) openPhase(`S${m[1]}`, true);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [openPhase]);

  // A newly approved phase unlocks the next one: close the approved card, open the next.
  useEffect(() => {
    if (!initialized.current || currentPhase === lastCurrent.current) return;
    const previous = lastCurrent.current;
    lastCurrent.current = currentPhase;
    if (currentPhase === "S7") return;
    setOpen((prev) => openAfterApproval(prev, previous, currentPhase));
    openPhase(currentPhase, true);
  }, [currentPhase, openPhase]);

  // Replay a sub-step click once the phase has mounted and registered its steps.
  useEffect(() => {
    const p = pendingStep.current;
    if (p && configs[p.phase]) {
      pendingStep.current = null;
      configs[p.phase].onStepClick(p.key);
    }
  }, [configs]);

  // Menu highlight follows the card in view.
  useEffect(() => {
    const els = FLOW_PHASES.map((p) => document.getElementById(p.id.toLowerCase())).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setInView(visible[0].target.id.toUpperCase());
      },
      { rootMargin: "-120px 0px -55% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const clickStep = (phase: string, key: string) => {
    if (statusOf(phase) === "locked") return;
    openPhase(phase, true);
    const cfg = configs[phase];
    if (cfg) {
      const clickable = cfg.completedSteps.has(key) || cfg.currentStep === key || !!cfg.isApproved;
      if (clickable) cfg.onStepClick(key);
    } else {
      pendingStep.current = { phase, key };
    }
  };

  const toggle = (id: string) => {
    if (open.has(id)) {
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      openPhase(id, false);
    }
  };

  return (
    <div className="md:flex md:items-start md:gap-6">
      {/* Left menu: phases + sub-steps */}
      <nav
        aria-label="SEO phases"
        className="mb-4 md:mb-0 md:w-60 md:shrink-0 md:sticky md:top-7 lg:top-5 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto"
      >
        <ol className="space-y-1">
          {FLOW_PHASES.map((p, i) => {
            const status = statusOf(p.id);
            const cfg = configs[p.id];
            const steps = (cfg?.steps ?? STATIC_STEPS[p.id]).filter((s) => p.id !== "S6" || !POST_S6_KEYS.has(s.key));
            const locked = status === "locked";
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openPhase(p.id, true)}
                  disabled={locked}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-full border px-3 text-left text-[13px] font-medium leading-none transition-colors",
                    inView === p.id && !locked ? "border-brand/30 bg-brand/10 text-brand" : "border-transparent hover:bg-muted/50",
                    locked && "cursor-not-allowed opacity-50"
                  )}
                >
                  <StatusIcon status={status} index={i - 1} />
                  <span className="text-[10px] font-bold text-muted-foreground">{p.id}</span>
                  <span className="truncate">{p.label}</span>
                </button>
                {!locked && (
                  <ol className="ml-[21px] mt-1 space-y-0.5 border-l border-border pl-3">
                    {steps.map((s) => {
                      const isCurrent = cfg?.currentStep === s.key;
                      const done = !!cfg && (cfg.completedSteps.has(s.key) || (!!cfg.isApproved && !isCurrent));
                      return (
                        <li key={s.key}>
                          <button
                            type="button"
                            onClick={() => clickStep(p.id, s.key)}
                            className={cn(
                              "flex w-full items-center gap-1.5 rounded-full px-2 py-1 text-left text-[11px] transition-colors hover:bg-muted/50",
                              isCurrent ? "font-medium text-brand" : done ? "text-emerald-400" : "text-muted-foreground"
                            )}
                          >
                            {done && <Check className="size-3 shrink-0" />}
                            <span className="truncate">{s.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
          {POST_S6.map((p, j) => {
            const status = postS6Status(statusOf("S6"), configs.S6, p.key);
            const locked = status === "locked";
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => clickStep("S6", p.key)}
                  disabled={locked}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-full border px-3 text-left text-[13px] font-medium leading-none transition-colors",
                    configs.S6?.currentStep === p.key && !locked ? "border-brand/30 bg-brand/10 text-brand" : "border-transparent hover:bg-muted/50",
                    locked && "cursor-not-allowed opacity-50"
                  )}
                >
                  <StatusIcon status={status} index={FLOW_PHASES.length - 1 + j} />
                  <span className="text-[10px] font-bold text-muted-foreground">{p.id}</span>
                  <span className="truncate">{p.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Stacked phase cards */}
      <div className="min-w-0 flex-1 space-y-4">
        {FLOW_PHASES.map((p, i) => {
          const status = statusOf(p.id);
          const isOpen = open.has(p.id);
          const locked = status === "locked";
          const Phase = PHASE_COMPONENTS[p.id];
          const prev = FLOW_PHASES[i - 1];
          return (
            <section
              key={p.id}
              id={p.id.toLowerCase()}
              className={cn("scroll-mt-14 border border-border bg-card/40", isOpen ? "rounded-[18px]" : "rounded-full", locked && "opacity-60")}
            >
              <button
                type="button"
                onClick={() => !locked && toggle(p.id)}
                disabled={locked}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
              >
                <StatusIcon status={status} index={i - 1} />
                <span className="text-xs font-bold text-muted-foreground">{p.id}</span>
                <span className="text-sm font-medium text-foreground">{p.label}</span>
                {locked && prev && (
                  <span className="text-[11px] text-muted-foreground">Approve {prev.id} {prev.label} to unlock</span>
                )}
                {/* Status pill right-aligned, just before the chevron */}
                <span
                  className={cn(
                    "ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold",
                    status === "approved" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                    status === "active" && "border-brand/30 bg-brand/10 text-brand",
                    (status === "completed" || status === "locked") && "border-border text-muted-foreground"
                  )}
                >
                  {STATUS_LABEL[status]}
                </span>
                {/* Same-width slot for locked cards so pills line up */}
                {locked ? (
                  <span className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                )}
              </button>
              {loaded.has(p.id) && (
                <div className={cn("border-t border-border px-4 pb-4 pt-4", !isOpen && "hidden")}>
                  <SeoPhaseCtx.Provider value={p.id}>
                    <Phase />
                  </SeoPhaseCtx.Provider>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
