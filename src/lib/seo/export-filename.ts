// Download names for the SEO phase exports, e.g.
//   REA_SC_US_B0CLMBGMS6_SEO_V01_Keywords.csv
// (replaces the old OUT_KEY / OUT_REV / OUT_ALEXA / OUT_COS / OUT_SEO names).

export function seoExportFilename(projectName: string | null | undefined, part: string, ext = "csv"): string {
  const safe = (projectName || "").replace(/[/\\?%*:|"<>]/g, "-").trim();
  return `${safe && safe !== "Untitled Project" ? `${safe}_` : ""}${part}.${ext}`;
}
