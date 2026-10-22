/**
 * Client website + social accounts (Client Settings → Website & Social).
 * Stored as keys on the client's AAC row (raw_data), next to the sheet columns;
 * BrandURL is the AAC sheet's existing website column.
 */
export const WEB_SOCIAL_FIELDS = [
  { key: "BrandURL", label: "Website", placeholder: "https://brand.com", prefix: "" },
  { key: "Instagram", label: "Instagram", placeholder: "https://instagram.com/brand", prefix: "https://instagram.com/" },
  { key: "Facebook", label: "Facebook", placeholder: "https://facebook.com/brand", prefix: "https://facebook.com/" },
  { key: "TikTok", label: "TikTok", placeholder: "https://tiktok.com/@brand", prefix: "https://tiktok.com/@" },
  { key: "LinkedIn", label: "LinkedIn", placeholder: "https://linkedin.com/company/brand", prefix: "https://linkedin.com/company/" },
  { key: "XTwitter", label: "X (Twitter)", placeholder: "https://x.com/brand", prefix: "https://x.com/" },
  { key: "YouTube", label: "YouTube", placeholder: "https://youtube.com/@brand", prefix: "https://youtube.com/@" },
  { key: "Pinterest", label: "Pinterest", placeholder: "https://pinterest.com/brand", prefix: "https://pinterest.com/" },
] as const;
export type WebSocialKey = (typeof WEB_SOCIAL_FIELDS)[number]["key"];

/**
 * Normalizes what people paste: a full URL is kept; "@brand" or "brand" becomes
 * the network's URL; a bare domain gets https://. Empty stays empty.
 */
export function normalizeSocial(key: WebSocialKey, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const field = WEB_SOCIAL_FIELDS.find((f) => f.key === key)!;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v) && (!field.prefix || v.includes("."))) return `https://${v}`;
  return field.prefix ? `${field.prefix}${v.replace(/^@/, "")}` : `https://${v}`;
}
