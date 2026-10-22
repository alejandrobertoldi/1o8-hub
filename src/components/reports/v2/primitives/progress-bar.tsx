import type { SurfacePalette } from "./palette";

export function ProgressBar({ pct, palette }: { pct: number; palette: SurfacePalette }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-[58px] overflow-hidden rounded-full bg-[#e7ebed]" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full" style={{ width: `${clamped}%`, background: palette.accent }} />
    </div>
  );
}
