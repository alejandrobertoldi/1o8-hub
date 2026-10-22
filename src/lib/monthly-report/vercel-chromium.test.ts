import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Vercel Chromium packaging for monthly report generate", () => {
  it("traces @sparticuz/chromium into the generate route, not only /pdf", () => {
    const src = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(src).toMatch(/"\/api\/reports\/monthly"/);
    expect(src).toMatch(/"\/api\/reports\/monthly\/route"/);
    expect(src).toMatch(/"\/api\/reports\/monthly\/pdf"/);
    expect(src).toMatch(/@sparticuz\/chromium\/\*\*\/\*/);
  });

  it("spoofs Lambda runtime env so Chromium extracts AL2023 libs on Vercel", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/monthly-report/pdf-render.ts"), "utf8");
    expect(src).toMatch(/prepareServerlessChromium\(\)/);
  });

  it("gives the generate function enough memory to launch Chromium", () => {
    const src = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    expect(src).toMatch(/src\/app\/api\/reports\/monthly\/route\.ts/);
    expect(src).toMatch(/"memory": 2048/);
  });

  it("gives generate 300s so Chromium extract + print + Drive fit under Vercel Pro", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/reports/monthly/route.ts"), "utf8");
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    expect(route).toMatch(/export const maxDuration = 300/);
    expect(vercel).toMatch(/"maxDuration": 300/);
  });
});
