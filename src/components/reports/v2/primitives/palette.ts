export type Surface = "hub" | "portal";

export interface SurfacePalette {
  surface: Surface;
  /** page/shell background */
  canvas: string;
  /** hero KPI card fill — text-bearing */
  heroFill: string;
  /** hero KPI card mini-stat (previous year / goal) fill */
  heroMiniFill: string;
  heroText: string;
  /** primary CTA (Refresh) fill */
  cta: string;
  ctaText: string;
  /** current-period line, progress bars, active state, icons */
  accent: string;
  /** section-heading eyebrow Tailwind class */
  eyebrowClass: string;
}

const HUB: SurfacePalette = {
  surface: "hub",
  canvas: "var(--mf-charcoal)",
  heroFill: "var(--mf-orange)",
  heroMiniFill: "#ff8b48",
  heroText: "var(--mf-white)",
  cta: "var(--brand-solid)",
  ctaText: "var(--mf-white)",
  accent: "var(--mf-orange)",
  eyebrowClass: "text-brand",
};

const PORTAL: SurfacePalette = {
  surface: "portal",
  canvas: "var(--mf-ghost)",
  heroFill: "var(--portal-accent)",
  heroMiniFill: "rgba(255,255,255,0.15)",
  heroText: "var(--mf-white)",
  cta: "var(--portal-accent)",
  ctaText: "var(--mf-white)",
  accent: "var(--portal-accent)",
  eyebrowClass: "text-portal-accent",
};

export function getSurfacePalette(surface: Surface): SurfacePalette {
  return surface === "portal" ? PORTAL : HUB;
}
