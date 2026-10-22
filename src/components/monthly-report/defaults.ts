// 1o8 brand tokens (single-tenant).
// Hex values match DESIGN.md / --mf-* in globals.css. styles/report.css
// consumes them via CSS variables; SVG charts bind ink/grid/paper to those
// aliases so dark mode can remap them. Accent stays a hex.

export const brand = {
  agency: '1o8',
  logoPath: '/logo.svg',
  contactDomain: 'marketfoundry.agency',
  colors: {
    ink: '#2C2B35',
    paper: '#FEFEFE',
    paperSoft: '#F4F4F2',
    grey: '#2C2B35',
    accent: '#F7BF1D',
    positive: '#18864B',
    neutral:  '#A66600',
    negative: '#C73737',
  },
  fonts: {
    display: 'var(--font-outfit), system-ui, sans-serif',
    body:    'var(--font-outfit), system-ui, sans-serif',
    mono:    'var(--font-mono), ui-monospace, monospace',
  },
} as const;

/** Map the retired Dr. Cuddles gold onto burnt orange so cached reports restyle. */
const LEGACY_GOLD = /^#(?:F8BF1C|F7BF1D)$/i;

export function resolveAccent(raw?: string): string {
  if (!raw || LEGACY_GOLD.test(raw.trim())) return brand.colors.accent;
  return raw.trim();
}
