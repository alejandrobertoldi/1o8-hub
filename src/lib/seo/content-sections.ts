// SEO content sections and the dimension-specific rule types, shared by the
// New SEO Project wizard and the project's S0.3 "Content Rules" edit.

export type ContentRuleMode = "shared" | "dimension_specific";
export interface ContentRule {
  mode: ContentRuleMode;
  dimensions: string[]; // e.g. ["flavor", "size"]
}

// Content sections for the rules step. Bullets are ONE set of 5 (stored as detailed_bullet_N /
// DetailedBulletPoint_N); Concise / Content / Key Features versions were retired 2026-09-29.
export const CONTENT_SECTIONS: { key: string; label: string; group: string }[] = [
  { key: "title", label: "Title", group: "Title" },
  { key: "detailed_bullet_1", label: "Bullet Point 1", group: "Bullet Points" },
  { key: "detailed_bullet_2", label: "Bullet Point 2", group: "Bullet Points" },
  { key: "detailed_bullet_3", label: "Bullet Point 3", group: "Bullet Points" },
  { key: "detailed_bullet_4", label: "Bullet Point 4", group: "Bullet Points" },
  { key: "detailed_bullet_5", label: "Bullet Point 5", group: "Bullet Points" },
  { key: "description", label: "Product Description", group: "Description" },
  { key: "backend_search_terms", label: "Backend Search Terms", group: "Backend" },
];

export const DIMENSION_LABELS: Record<string, string> = {
  flavor: "Flavor",
  size: "Size",
  color: "Color",
  style: "Style",
};

export const DIMENSION_COLORS: Record<string, string> = {
  flavor: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  size: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};
