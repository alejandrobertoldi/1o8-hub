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
}

export default function StepNav({ steps, currentStep, onStepClick, completedSteps, isApproved }: StepNavProps) {
  return (
    <div className="sticky top-[5rem] z-10 bg-surface-0 pb-3 mb-3">
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
                ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/30"
                : isCompleted || isApproved
                ? "bg-accent-green/10 text-accent-green hover:bg-accent-green/15 cursor-pointer"
                : "bg-surface-2 text-zinc-600 cursor-not-allowed"
            }`}
          >
            <span className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold ${
              isCurrent
                ? "bg-brand-500 text-surface-0"
                : isCompleted || isApproved
                ? "bg-accent-green/20 text-accent-green"
                : "bg-surface-4 text-zinc-600"
            }`}>
              {isCompleted || (isApproved && !isCurrent) ? "\u2713" : i + 1}
            </span>
            {s.label}
            {i < steps.length - 1 && (
              <span className={`ml-1 h-px w-4 shrink-0 ${isCompleted || isApproved ? "bg-accent-green/30" : "bg-surface-4"}`} />
            )}
          </button>
        );
      })}
      </div>
    </div>
  );
}
