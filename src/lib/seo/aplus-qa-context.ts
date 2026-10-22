// S6.7 Premium A+ Q&A: the product text given to the model per ASIN — Title, ALL five bullets and
// the FULL description, so Q&A pairs neither repeat nor contradict anything already on the listing.
export function productTextLines(row: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const text = (k: string) => (typeof row[k] === "string" ? (row[k] as string).trim() : "");
  if (text("Title")) lines.push(`Title: ${text("Title")}`);
  for (let i = 1; i <= 5; i++) {
    const bp = text(`DetailedBulletPoint_${i}`);
    if (bp) lines.push(`B${i}: ${bp}`);
  }
  if (text("ProductDescription")) lines.push(`Description: ${text("ProductDescription")}`);
  return lines;
}
