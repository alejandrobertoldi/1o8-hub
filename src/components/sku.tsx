// One look for every SKU in the app: Geist Mono, medium weight, the --sku colour
// (sky-700 light / sky-300 dark). Size follows the surrounding text unless a
// className overrides it. See DESIGN.md → Typography → Identifiers.
import { cn } from "@/lib/utils";

export function Sku({ sku, className }: { sku: string | null | undefined; className?: string }) {
  if (!sku) return null;
  return <span className={cn("font-mono font-medium text-sku break-all", className)}>{sku}</span>;
}
