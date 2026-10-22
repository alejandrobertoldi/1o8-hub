import { cn } from "@/lib/utils";

/**
 * 1o8 Agency wordmark ("108 AGENCY"). Ink on light surfaces, white on dark —
 * both variants render and CSS picks one, so there is no theme flash.
 * Source PNG: docs/brand/1o8-logo-original.png (see docs/brand/1O8-BRAND.md).
 */
export function BrandLogo({ className, variant = "wordmark" }: { className?: string; variant?: "wordmark" | "mark" }) {
  const base = variant === "mark" ? "/1o8_Mark" : "/1o8_Logo";
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${base}_Ink.png`} alt="1o8 Agency" className={cn("w-auto object-contain dark:hidden", className)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${base}_White.png`} alt="1o8 Agency" className={cn("hidden w-auto object-contain dark:block", className)} />
    </>
  );
}
