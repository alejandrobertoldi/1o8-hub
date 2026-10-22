import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

it("S6.6 Audit sends the full brand guidelines (no 500-character cut)", () => {
  const audit = read("src/app/api/seo/claude/seo-audit/route.ts");
  expect(audit).toContain("BRAND GUIDELINES: ${guidelines}`");
  expect(audit).not.toMatch(/guidelines\.substring/);
});

it("S6.5 Refine Backend Keywords receives and uses the brand guidelines", () => {
  const route = read("src/app/api/seo/claude/seo-backend-refine/route.ts");
  expect(route).toMatch(/const \{ rows, keywords, guidelines \} = body;/);
  expect(route).toContain("BRAND GUIDELINES (follow any rules about words to exclude");
  const page = read("src/components/seo/phases/seo-phase.tsx");
  expect(page).toContain("keywords: keywords.slice(0, 60), guidelines: guidelines || undefined");
  expect(page).toContain("}, [rows, keywords, batches, lockedCells, guidelines]);"); // not a stale empty value
});
