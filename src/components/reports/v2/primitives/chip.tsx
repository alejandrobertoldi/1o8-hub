import type { ReactNode } from "react";

export type ChipTone = "positive" | "negative" | "warning" | "neutral";

const TONE: Record<ChipTone, string> = {
  positive: "text-mf-positive bg-mf-positive-bg",
  negative: "text-mf-negative bg-mf-negative-bg",
  warning: "text-mf-warning bg-mf-warning-bg",
  neutral: "text-mf-charcoal bg-mf-ghost",
};

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  );
}
