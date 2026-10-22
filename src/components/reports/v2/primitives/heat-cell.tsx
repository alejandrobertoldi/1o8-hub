import type { ReactNode } from "react";
import type { Band } from "./status-bands";

const BAND: Record<Band, string> = {
  good: "text-mf-positive bg-mf-positive-bg",
  warn: "text-mf-warning bg-mf-warning-bg",
  bad: "text-mf-negative bg-mf-negative-bg",
  none: "text-mf-muted bg-mf-ghost",
};

export function HeatCell({ band, children }: { band: Band; children: ReactNode }) {
  return (
    <span className={`inline-block min-w-[58px] rounded-[7px] px-[7px] py-[5px] text-center font-semibold tabular-nums ${BAND[band]}`}>
      {children}
    </span>
  );
}
