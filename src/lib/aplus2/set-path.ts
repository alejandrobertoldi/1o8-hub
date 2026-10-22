export type Aplus2ContentType = "PA+" | "BA+";

export function parseAplus2ContentType(
  value: string | null | undefined
): Aplus2ContentType | null {
  if (!value) return null;
  const v = value.trim();
  if (v === "BA+" || v === "ABasic" || v === "BAplus") return "BA+";
  if (v === "PA+" || v === "APlus" || v === "Aplus" || v === "PAplus") return "PA+";
  return null;
}

export function aplus2ContentTypeLabel(contentType: string): string {
  return contentType === "BA+" ? "Basic A+" : "Premium A+";
}

export function asAplus2ContentType(
  value: string | null | undefined,
  fallback: Aplus2ContentType = "PA+"
): Aplus2ContentType {
  return parseAplus2ContentType(value) ?? fallback;
}

/** Version tier wins; set.contentType is the latest-version fallback. */
export function aplus2VersionTier(
  versionContentType: string | null | undefined,
  setContentType: string | null | undefined
): Aplus2ContentType {
  return asAplus2ContentType(versionContentType, asAplus2ContentType(setContentType));
}

/** One editor URL per ASIN set. Versions of both tiers live on that page. */
export function aplus2SetHref(args: {
  clientIdCode: string;
  marketplace: string;
  scopeIdentifier: string;
  contentType?: string;
}): string {
  return `/design/aplus2/${args.clientIdCode}/${args.marketplace}/${args.scopeIdentifier}`;
}

export function findAplus2SetId(
  sets: { id: string; marketplace: string; scopeIdentifier: string; contentType?: string }[],
  args: { marketplace: string; scopeIdentifier: string; contentType?: string | null }
): string | null {
  const matches = sets.filter(
    (s) => s.marketplace === args.marketplace && s.scopeIdentifier === args.scopeIdentifier
  );
  if (matches.length === 0) return null;
  if (args.contentType) {
    const typed = matches.find((s) => s.contentType === args.contentType);
    if (typed) return typed.id;
  }
  return matches[0].id;
}

/** Product detail URL that returns to the A+ list or the A+ editor. */
export function aplusProductDetailHref(
  productId: string,
  opts?: { marketplace?: string; setIdentifier?: string }
): string {
  const params = new URLSearchParams();
  if (opts?.marketplace && opts?.setIdentifier) {
    params.set("from", "aplus-editor");
    params.set("marketplace", opts.marketplace);
    params.set("set", opts.setIdentifier);
  } else {
    params.set("from", "aplus");
  }
  return `/products/${productId}?${params.toString()}`;
}
