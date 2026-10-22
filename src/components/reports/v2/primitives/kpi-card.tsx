import type { ReactNode } from "react";
import type { SurfacePalette } from "./palette";
import { Chip, type ChipTone } from "./chip";

export interface KpiMiniStat { label: string; value: string }

export function KpiCard({
  variant,
  label,
  value,
  chip,
  miniStats,
  sparkline,
  palette,
}: {
  variant: "hero" | "supporting";
  label: string;
  value: string;
  chip?: { tone: ChipTone; text: string };
  miniStats: [KpiMiniStat, KpiMiniStat];
  sparkline?: ReactNode;
  palette: SurfacePalette;
}) {
  const hero = variant === "hero";
  return (
    <div
      className={`flex min-h-[190px] flex-col overflow-hidden rounded-[18px] shadow-[0_10px_30px_rgba(16,34,39,0.12)] ${
        hero ? "border border-white/20" : "border border-black/10 bg-white text-mf-ink"
      }`}
      style={hero ? { background: palette.heroFill, color: palette.heroText } : undefined}
    >
      <div className="flex items-start justify-between gap-3.5 px-[18px] pt-[18px] pb-2.5">
        <div>
          <div className={`text-[10px] font-extrabold uppercase tracking-[0.11em] ${hero ? "" : "text-mf-muted"}`}>{label}</div>
          <div className="mt-[7px] text-[clamp(29px,2.5vw,42px)] font-extrabold leading-none tracking-[-0.045em] tabular-nums">{value}</div>
        </div>
        {chip && <Chip tone={chip.tone}>{chip.text}</Chip>}
      </div>
      <div className="grid grid-cols-2 gap-2 px-[18px] pb-3">
        {miniStats.map((m) => (
          <div
            key={m.label}
            className={`rounded-[10px] px-2.5 py-2 ${hero ? "" : "bg-mf-ghost"}`}
            style={hero ? { background: palette.heroMiniFill } : undefined}
          >
            <span className={`block text-[9px] uppercase tracking-[0.08em] ${hero ? "opacity-70" : "text-mf-muted"}`}>{m.label}</span>
            <b className="mt-[3px] block text-[13px] tabular-nums">{m.value}</b>
          </div>
        ))}
      </div>
      {sparkline && <div className="mt-auto h-[58px] px-3.5 pb-2.5">{sparkline}</div>}
    </div>
  );
}
