import { BRAND_CSS_VARS } from "./tokens";

/** Fallback --mf-* tokens so a Drive HTML file still paints if captured CSS uses var(). */
const MF_ROOT_VARS = `:root{--font-outfit:"Outfit",system-ui,sans-serif;--mf-orange:#F7BF1D;--mf-charcoal:#2C2B35;--mf-charcoal-900:#1E1D25;--mf-charcoal-700:#3A3944;--mf-ghost:#F4F4F2;--mf-white:#FEFEFE;--mf-ink:#2C2B35;--mf-muted:#6E6C77;--mf-line:#D8D7DC;--mf-positive:#18864B;--mf-warning:#A66600;--mf-negative:#C73737;}`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prefix root-relative src/href with origin so the file opens off-hub. */
export function absolutizeRootUrls(html: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return html.replace(/\b(src|href)="(\/[^"]*)"/g, (_m, attr: string, path: string) => (
    `${attr}="${base}${path}"`
  ));
}

export function buildStandaloneReportHtml(opts: {
  title: string;
  origin: string;
  bodyHtml: string;
  css: string;
}): string {
  const body = absolutizeRootUrls(opts.bodyHtml, opts.origin);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap">
<style>
${MF_ROOT_VARS}
${BRAND_CSS_VARS}
${opts.css}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
