import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brand, resolveAccent } from "./defaults";

const CSS_PATH = join(process.cwd(), "src/components/monthly-report/styles/report.css");

function css(): string {
  return readFileSync(CSS_PATH, "utf8");
}

describe("monthly report MF tokens", () => {
  it("does not pull Inter or JetBrains from Google Fonts", () => {
    const src = css();
    expect(src).not.toMatch(/fonts\.googleapis\.com/);
    expect(src).not.toMatch(/['"]Inter['"]/);
    expect(src).not.toMatch(/JetBrains/);
  });

  it("binds report aliases to --mf-* tokens and Outfit", () => {
    const src = css();
    expect(src).toMatch(/--orange:\s*var\(--mf-orange\)/);
    expect(src).toMatch(/--grey:\s*var\(--mf-charcoal\)/);
    expect(src).toMatch(/--ink:\s*var\(--mf-ink\)/);
    expect(src).toMatch(/--white:\s*var\(--mf-white\)/);
    expect(src).toMatch(/font-family:\s*var\(--font-outfit\)/);
  });

  it("flips canvas type in dark mode, keeps company-white cards, and print on paper", () => {
    const src = css();
    expect(src).toMatch(/html\.dark \.report-doc:not\(\.print-mode\)[\s\S]*?\{[^}]*--bg-card:\s*var\(--mf-white\)/);
    expect(src).not.toMatch(/html\.dark \.report-doc:not\(\.print-mode\)[\s\S]*?\{[^}]*--bg-card:\s*var\(--card\)/);
    expect(src).toMatch(/html\.dark \.report-doc:not\(\.print-mode\) h1:not\(\.cover-title\)/);
    expect(src).toMatch(/html\.dark \.report-doc:not\(\.print-mode\) :is\(\.stat-cell, \.hero-cell, \.chart-card/);
    expect(src).toMatch(/\.toc\.toc--chrome a\s*\{[^}]*--muted-foreground/);
    expect(src).not.toMatch(/\.toc\.toc--chrome a\s*\{[^}]*color-mix\([^)]*transparent/);
    expect(src).toMatch(/\.stat-cell\s*\{[^}]*background:\s*var\(--bg-card\)/);
    expect(src).toMatch(/@media print\s*\{[\s\S]*?\.report-doc\s*\{[^}]*--ink:\s*var\(--mf-ink\)/);
  });

  it("uses 1o8 burnt orange as the default accent hex", () => {
    expect(brand.colors.accent).toBe("#F7BF1D");
    expect(brand.fonts.body).toMatch(/--font-outfit/);
  });

  it("maps cached Dr. Cuddles gold onto burnt orange", () => {
    expect(resolveAccent("#F8BF1C")).toBe("#F7BF1D");
    expect(resolveAccent("#F7BF1D")).toBe("#F7BF1D");
    expect(resolveAccent("#112233")).toBe("#112233");
  });
});

describe("monthly report print pagination", () => {
  it("prints A4 landscape with one page geometry", () => {
    const src = css();
    expect(src).toMatch(/@page\s+monthly-report\s*\{[^}]*size:\s*A4 landscape/);
    expect(src).toMatch(/\.report-doc \.cover\s*\{[^}]*break-after:\s*page/);
    expect(src).toMatch(/\.report-doc section \+ section\s*\{[^}]*break-before:\s*page/);
    expect(src).not.toMatch(/size:\s*A4 portrait/);
    expect(src).not.toMatch(/@page\s+cover-page/);
    expect(src).not.toMatch(/min-height:\s*186mm/);
  });

  it("pins a large 1o8 logo on the cover and a running mark at the bottom-right of every page", () => {
    const src = css();
    expect(src).toMatch(/\.print-running-logo\s*\{[^}]*position:\s*fixed/);
    expect(src).toMatch(/\.print-running-logo\s*\{[^}]*bottom:\s*4mm/);
    expect(src).toMatch(/\.print-running-logo\s*\{[^}]*right:\s*12mm/);
    expect(src).not.toMatch(/\.print-running-logo\s*\{[^}]*top:\s*6mm/);
    expect(src).toMatch(/\.report-doc \.cover-logo img\s*\{[^}]*height:\s*132px/);
  });

  it("centers a page number in the print footer", () => {
    const src = css();
    expect(src).toMatch(/@bottom-center\s*\{[^}]*content:\s*counter\(page\)/);
  });

  it("renders the cover year slightly larger than the previous 26px print size", () => {
    const src = css();
    expect(src).toMatch(/\.cover-period \.year\s*\{[^}]*font-size:\s*clamp\(22px/);
    expect(src).toMatch(/\.cover-period \.year \{ font-size: 30px; \}/);
  });

  it("prints each dashboard on one landscape sheet and lets products flow", () => {
    const src = css();
    expect(src).toMatch(/section#kpis[\s\S]*?height:\s*178mm/);
    expect(src).toMatch(/section#campaigns[\s\S]*?height:\s*178mm/);
    expect(src).toMatch(/section#mom[\s\S]*?height:\s*178mm/);
    expect(src).toMatch(/section#kpis \.chart-card svg\s*\{[^}]*height:\s*42mm/);
    expect(src).toMatch(/section#campaigns \.chart-card svg\s*\{[^}]*height:\s*78mm/);
    expect(src).toMatch(/section#mom \.chart-card svg\s*\{[^}]*height:\s*64mm/);
    expect(src).not.toMatch(/min-height:\s*92mm/);
    expect(src).not.toMatch(/min-height:\s*170mm/);
  });

  it("hides the trailing footer so print does not emit a blank last page", () => {
    const src = css();
    expect(src).toMatch(/\.report-doc\.print-mode footer\s*\{[^}]*display:\s*none/);
  });

  it("lets the product table continue across landscape pages with a repeating header", () => {
    const src = css();
    expect(src).toMatch(/section#products\s*\{[^}]*break-inside:\s*auto/);
    expect(src).toMatch(/table\.dt thead\s*\{[^}]*display:\s*table-header-group/);
    expect(src).toMatch(/td\.product-title\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
});
