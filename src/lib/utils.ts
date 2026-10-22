import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Upgrade an Amazon product image URL to a higher resolution.
 * Amazon CDN URLs contain sizing suffixes like `._SL75_`, `._SX300_`, `._AC_SL1500_`.
 * This replaces those with `._SL500_` for crisp display at common UI sizes.
 * Non-Amazon URLs are returned unchanged.
 */
export function hiResAmazonImg(url: string | null | undefined, size = 500): string {
  if (!url) return "";
  if (!url.includes("media-amazon.com") && !url.includes("images-amazon.com")) return url;
  // Replace Amazon sizing suffix (e.g., ._SL75_. or ._AC_SL1500_.) with desired size
  return url.replace(/\._[A-Z]{2,}[\d,_]+_\./, `._SL${size}_.`);
}
