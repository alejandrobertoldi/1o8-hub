"use client";
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
import { KpiCard } from "./primitives/kpi-card";
import { KpiSparkline } from "./primitives/kpi-sparkline";
import { Surface } from "./primitives/surface";
import { buildKpiCards, type OverviewResponse, type KpiCardSpec } from "./primitives/kpi-derivations";

// Recharts strokes are SVG attributes → cannot resolve CSS var(); use concrete colours.
function strokeFor(surface: SurfaceKind, variant: "hero" | "supporting"): { current: string; py: string } {
  if (variant === "hero") return { current: "#FEFEFE", py: "rgba(254,254,254,0.45)" };
  return { current: surface === "hub" ? "#F7BF1D" : "#2C2B35", py: "#9AA7AC" };
}

export function HeadlinePerformanceSection({
  surface,
  overview,
  loading,
  requestKey,
}: {
  surface: SurfaceKind;
  overview: OverviewResponse | null;
  loading: boolean;
  requestKey: string;
}) {
  const palette = getSurfacePalette(surface);

  if (!requestKey) {
    return <Surface><div className="p-[18px] text-mf-muted">Select a client and date range to load performance.</div></Surface>;
  }
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="min-h-[190px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="min-h-[190px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
          ))}
        </div>
      </div>
    );
  }
  if (!overview || typeof overview.totalSales !== "number") {
    return <Surface><div className="p-[18px] text-mf-muted">Performance data is unavailable for this period.</div></Surface>;
  }

  const cards = buildKpiCards(overview);
  const render = (c: KpiCardSpec) => {
    const s = strokeFor(surface, c.variant);
    return (
      <KpiCard
        key={c.key}
        variant={c.variant}
        label={c.label}
        value={c.value}
        chip={c.chip}
        miniStats={c.miniStats}
        palette={palette}
        sparkline={<KpiSparkline current={c.spark.current} py={c.spark.py} currentStroke={s.current} pyStroke={s.py} />}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.filter((c) => c.variant === "hero").map(render)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.filter((c) => c.variant === "supporting").map(render)}
      </div>
    </div>
  );
}
