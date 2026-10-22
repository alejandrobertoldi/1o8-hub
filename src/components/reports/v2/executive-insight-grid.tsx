import type { Insight } from "./primitives/insights";
import { InsightCard } from "./insight-card";
import { Surface } from "./primitives/surface";

export function ExecutiveInsightGrid({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">
          No material insights this period — performance is tracking to expectations.
        </div>
      </Surface>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {insights.map((ins) => (
        <InsightCard key={`${ins.kind}:${ins.sourceMetrics.join(",")}`} insight={ins} />
      ))}
    </div>
  );
}
