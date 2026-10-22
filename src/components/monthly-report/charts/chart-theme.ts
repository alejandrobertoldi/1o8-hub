import { brand } from "../defaults";

/** Chart fills. Cards stay company white (--bg-card / --mf-white) in dark mode;
    canvas type is handled in report.css. Accent stays a hex. */
export const CHART_THEME = {
  accent: brand.colors.accent,
  ink: "var(--ink)",
  muted: "var(--muted)",
  grid: "var(--rule)",
  paper: "var(--bg-card)",
  font: brand.fonts.body,
} as const;
