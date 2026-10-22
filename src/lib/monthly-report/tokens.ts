// Single source of truth for brand colours used by BOTH renderers.
// HTML artifact embeds `BRAND_CSS_VARS`. React preview imports `BRAND_COLORS`.
// Hexes match DESIGN.md / --mf-* (hub burnt orange, charcoal, ghost, off-black).

export const BRAND_COLORS = {
  orange: "#F7BF1D",
  orangeDeep: "#A67C00",
  grey: "#2C2B35",
  black: "#000000",
  white: "#FEFEFE",
  positive: "#18864B",
  neutral: "#A66600",
  negative: "#C73737",
  inkDim: "#6E6C77",
  muted: "#6E6C77",
  paper2: "#F4F4F2",
  paper3: "#F4F4F2",
  rule: "#D8D7DC",
  ruleSoft: "#D8D7DC",
  slate: "#2C2B35",
} as const;

export const BRAND_CSS_VARS = `
:root{
  --orange:${BRAND_COLORS.orange};
  --grey:${BRAND_COLORS.grey};
  --black:${BRAND_COLORS.black};
  --white:${BRAND_COLORS.white};
  --positive:${BRAND_COLORS.positive};
  --positive-bg:rgba(24,134,75,0.12);
  --neutral:${BRAND_COLORS.neutral};
  --neutral-bg:rgba(166,102,0,0.18);
  --negative:${BRAND_COLORS.negative};
  --negative-bg:rgba(199,55,55,0.12);
  --ink:#2C2B35;
  --ink-soft:${BRAND_COLORS.grey};
  --ink-dim:${BRAND_COLORS.inkDim};
  --muted:${BRAND_COLORS.muted};
  --paper:${BRAND_COLORS.white};
  --paper-2:${BRAND_COLORS.paper2};
  --paper-3:${BRAND_COLORS.paper3};
  --rule:${BRAND_COLORS.rule};
  --rule-soft:${BRAND_COLORS.ruleSoft};
  --orange-deep:${BRAND_COLORS.orangeDeep};
  --orange-bg:rgba(247,191,29,0.12);
  --slate:${BRAND_COLORS.slate};
  --slate-bg:rgba(42,80,89,0.08);
}
`.trim();
