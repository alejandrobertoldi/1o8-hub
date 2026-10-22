import type { Surface } from "./palette";
import type { Band } from "./status-bands";

/** Concrete hex — Recharts cannot resolve CSS var(). These are the SHARED
 *  categorical DATA colors (§4.4): identical on hub and portal. */
export const CHART_DATA = {
  adRevenue: "#18864B",   // --mf-positive green
  adSpend: "#65418A",     // purple (spec §4.4)
  cvrCtr: "#5B6EF5",      // blue (spec §4.4)
  impressions: "#94A3B8", // neutral slate — non-brand, safe on the portal surface
} as const;

/** Health-band → status hex, for ROAS-ranking bars and scatter bubbles. */
export const BAND_HEX: Record<Band, string> = {
  good: "#18864B",
  warn: "#A66600",
  bad: "#C73737",
  none: "#94A3B8",
};

/** The emphasis / current-period series stroke. Orange on hub, charcoal on
 *  portal — the load-bearing dual-accent rule: NEVER orange for EMPHASIS on
 *  the portal.
 *
 *  Scope (ruled 2026-08-04, see DESIGN.md → "Narrow exception — categorical
 *  chart data fills"): the rule governs accents and emphasis series, NOT the
 *  shared multi-slot categorical data palettes. `SLOT_COLORS`
 *  (advertising-audit-section) and `STACK` (inventory-section) keep #F7BF1D in
 *  slot 0 on both surfaces, as a category key beside blue/green/purple. */
export function accentFor(surface: Surface): string {
  return surface === "portal" ? "#2C2B35" : "#F7BF1D";
}
