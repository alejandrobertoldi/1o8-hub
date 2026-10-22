export interface S7Keyword {
  KeywordText: string;
  KeywordSearchVolume: number;
  KeywordPriorityTier: string;
  KeywordPrimaryUseLocation: string;
  KeywordIsNegative?: boolean;
  [key: string]: unknown;
}

export interface DistributedKeywords {
  title: S7Keyword[];
  bullets: S7Keyword[];
  description: S7Keyword[];
  backend: S7Keyword[];
}

const TIER_FALLBACK: Record<string, keyof DistributedKeywords> = {
  T1: "title",
  T2: "bullets",
  T3: "description",
  T4: "backend",
};

const LOCATION_TO_SECTION: Record<string, keyof DistributedKeywords> = {
  Title: "title",
  "Bullet Points": "bullets",
  Bullets: "bullets",
  Description: "description",
  "Backend Search Terms": "backend",
  Backend: "backend",
};

function sectionFor(kw: S7Keyword): keyof DistributedKeywords {
  const loc = kw.KeywordPrimaryUseLocation;
  if (loc && LOCATION_TO_SECTION[loc]) return LOCATION_TO_SECTION[loc];
  return TIER_FALLBACK[kw.KeywordPriorityTier] ?? "backend";
}

export function distributeKeywords(keywords: S7Keyword[]): DistributedKeywords {
  const result: DistributedKeywords = {
    title: [],
    bullets: [],
    description: [],
    backend: [],
  };
  const seen = new Set<string>();
  for (const k of keywords) {
    if (k.KeywordIsNegative) continue;
    const key = (k.KeywordText || "").toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result[sectionFor(k)].push(k);
  }
  return result;
}

export function computeLeftoverKeywords(
  candidates: S7Keyword[],
  currentRows: Array<Record<string, unknown>>,
): S7Keyword[] {
  const haystack = currentRows
    .map((r) =>
      Object.entries(r)
        .filter(([k, v]) => typeof v === "string" && k !== "ASIN" && k !== "asin")
        .map(([, v]) => String(v))
        .join(" ")
    )
    .join(" ")
    .toLowerCase();
  return candidates.filter(
    (k) => !haystack.includes((k.KeywordText || "").toLowerCase()),
  );
}
