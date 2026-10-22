import { expect, it } from "vitest";
import { CONTENT_SECTIONS } from "./content-sections";

it("bullets are one set of 5 — no Concise / Content / Key Features versions", () => {
  const bullets = CONTENT_SECTIONS.filter((s) => s.group === "Bullet Points");
  expect(bullets.map((s) => s.key)).toEqual([1, 2, 3, 4, 5].map((n) => `detailed_bullet_${n}`));
  expect(CONTENT_SECTIONS.some((s) => /concise|content_bullet|key_feature/.test(s.key))).toBe(false);
  expect([...new Set(CONTENT_SECTIONS.map((s) => s.group))]).toEqual(["Title", "Bullet Points", "Description", "Backend"]);
});
