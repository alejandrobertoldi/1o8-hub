import { Check } from "lucide-react";
import { pipelineSteps } from "@/lib/monthly-report/review";

function stepLabelClass(state: string): string {
  const base = "px-1 pb-0.5 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap";
  if (state === "complete") return `${base} text-muted-foreground line-through`;
  if (state === "current") return `${base} text-brand`;
  if (state === "error") return `${base} text-brand-red`;
  return `${base} text-sidebar-border`;
}

function boxClass(state: string): string {
  const base = "inline-flex size-3.5 items-center justify-center rounded-[2px] border";
  if (state === "complete") return `${base} border-brand-solid bg-brand-solid text-white`;
  if (state === "current") return `${base} border-brand bg-background`;
  if (state === "error") return `${base} border-brand-red bg-background`;
  return `${base} border-sidebar-border bg-background`;
}

function checkboxName(label: string, state: string): string {
  if (state === "complete") return `${label} complete`;
  if (state === "current") return `${label} current`;
  if (state === "error") return `${label} failed`;
  return `${label} pending`;
}

export function ReviewPipeline({ status }: { status?: string }) {
  const steps = pipelineSteps(status);
  return (
    <table className="w-max border-collapse" aria-label="Review pipeline">
      <thead>
        <tr>
          {steps.map((step) => (
            <th key={step.id} className={stepLabelClass(step.state)}>
              {step.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {steps.map((step) => {
            const ticked = step.state === "complete";
            return (
              <td key={step.id} className="px-1 pt-0.5 text-center">
                <span
                  role="checkbox"
                  aria-checked={ticked}
                  aria-disabled="true"
                  aria-label={checkboxName(step.label, step.state)}
                  className={boxClass(step.state)}
                >
                  {ticked ? <Check className="size-2.5" strokeWidth={3} aria-hidden /> : null}
                </span>
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
