/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

interface Step {
  key: string;
  label: string;
}

interface StepNavProps {
  steps: Step[];
  currentStep: string;
  onStepClick: (key: string) => void;
  completedSteps: Set<string>;
  isApproved?: boolean;
  title?: string;
  subtitle?: string;
}

export default function StepNav({ steps, currentStep, onStepClick, completedSteps, isApproved, title, subtitle }: StepNavProps) {
  return (
    <div className="sticky z-10 -mx-6 lg:-mx-10 px-6 lg:px-10 pt-3 pb-3 mb-3 bg-background border-b border-border/50" style={{ top: "var(--pipeline-nav-h, 0px)" }}>
      {title && (
        <>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground mb-1">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>}
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
      {steps.map((s, i) => {
        const isCurrent = s.key === currentStep;
        const isCompleted = completedSteps.has(s.key);
        const isClickable = isCompleted || isCurrent || !!isApproved;

        return (
          <button
            key={s.key}
            onClick={() => isClickable && onStepClick(s.key)}
            disabled={!isClickable}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-bold transition-all ${
              isCurrent
                ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
                : isCompleted || isApproved
                ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 cursor-pointer"
                : "bg-muted text-muted-foreground/60 cursor-not-allowed"
            }`}
          >
            <span className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold ${
              isCurrent
                ? "bg-amber-500 text-background"
                : isCompleted || isApproved
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-muted/70 text-muted-foreground/60"
            }`}>
              {isCompleted || (isApproved && !isCurrent) ? "✓" : i + 1}
            </span>
            {s.label}
            {i < steps.length - 1 && (
              <span className={`ml-1 h-px w-4 shrink-0 ${isCompleted || isApproved ? "bg-emerald-500/30" : "bg-border"}`} />
            )}
          </button>
        );
      })}
      </div>
    </div>
  );
}
