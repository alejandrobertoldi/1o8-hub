import type { Insight, InsightKind } from "./primitives/insights";

const KIND_EYEBROW: Record<InsightKind, string> = {
  yoy: "Year over year",
  efficiency: "Efficiency",
  "target-variance": "Versus target",
  "traffic-anomaly": "Traffic & conversion",
};

// tone → left accent bar colour. Shared status tokens (identical on both surfaces).
const TONE_BAR: Record<Insight["tone"], string> = {
  positive: "var(--mf-positive)",
  negative: "var(--mf-negative)",
  warning: "var(--mf-warning)",
  neutral: "var(--mf-muted)",
};

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article
      aria-label={insight.title}
      className="flex h-full flex-col overflow-hidden rounded-[18px] border border-mf-line bg-white p-[18px] shadow-[0_10px_30px_rgba(16,34,39,0.12)]"
      style={{ borderLeftWidth: "4px", borderLeftColor: TONE_BAR[insight.tone] }}
    >
      <div className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-mf-muted">
        {KIND_EYEBROW[insight.kind]}
      </div>
      <div className="mt-2 text-[15px] font-bold leading-snug tracking-tight text-mf-ink">
        {insight.title}
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-mf-muted tabular-nums">{insight.detail}</p>
    </article>
  );
}
