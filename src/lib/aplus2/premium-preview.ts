import { aplus2VersionTier } from "@/lib/aplus2/set-path";

export function aplusCoverUrls(
  moduleThumbs: string[] | undefined,
  fallback: string | null | undefined,
): string[] {
  if (moduleThumbs && moduleThumbs.length > 0) return moduleThumbs.slice(0, 2);
  return fallback ? [fallback] : [];
}

export function firstTwoModules<M extends { position: number }>(modules: M[]): M[] {
  return [...modules].sort((a, b) => a.position - b.position).slice(0, 2);
}

/** Latest Premium A+ version, first two modules in editor order. */
export function firstTwoPremiumModules<M extends { position: number }>(
  versions: Array<{
    versionNumber: number;
    contentType?: string | null;
    modules: M[];
  }>,
): M[] {
  const premium = versions
    .filter((v) => aplus2VersionTier(v.contentType, null) === "PA+")
    .sort((a, b) => b.versionNumber - a.versionNumber);
  const latest = premium[0];
  if (!latest) return [];
  return firstTwoModules(latest.modules);
}
