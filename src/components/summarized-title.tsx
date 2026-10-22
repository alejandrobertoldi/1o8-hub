// One look for every summarized title in the app (DESIGN.md → Typography → Identifiers):
// product name in Outfit medium (text-foreground/80), variation in regular muted.
//   layout="stacked" — name on line 1, variation on line 2 (table cells)
//   layout="inline"  — "Name · Variation" on one line, truncated, full text on hover (lists)
//   layout="lines"   — name, then each "|"-separated variation attribute on its own line
//                      (DESIGN.md → Product Identity, right column)
// Size follows the surrounding text. Nothing renders when there is no title.
import { cn } from "@/lib/utils";
import { splitSummarizedTitle } from "@/lib/summarized-title";

export function SummarizedTitle({
  title, layout = "stacked", className,
}: { title: string | null | undefined; layout?: "stacked" | "inline" | "lines"; className?: string }) {
  const parts = splitSummarizedTitle(title);
  if (!parts) return null;
  if (layout === "inline") {
    return (
      <span className={cn("block min-w-0 truncate", className)} title={String(title).trim()}>
        <span className="font-medium text-foreground/80">{parts.name}</span>
        {parts.variant && <span className="text-muted-foreground"> · {parts.variant}</span>}
      </span>
    );
  }
  if (layout === "lines") {
    const attrs = parts.variant.split("|").map((a) => a.trim()).filter(Boolean);
    return (
      <span className={cn("block", className)}>
        <span className="block font-medium text-foreground/80">{parts.name}</span>
        {attrs.map((a, i) => (
          <span key={i} className="block text-muted-foreground">{a}</span>
        ))}
      </span>
    );
  }
  return (
    <span className={cn("block", className)}>
      <span className="block font-medium text-foreground/80">{parts.name}</span>
      {parts.variant && <span className="block text-muted-foreground">{parts.variant}</span>}
    </span>
  );
}
