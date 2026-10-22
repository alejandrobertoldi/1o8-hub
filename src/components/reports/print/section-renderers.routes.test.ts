import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SECTION_RENDERERS } from "./section-renderers";
import { isPrintSectionId, type PrintSectionId } from "./print-sections";

/** Couples the print ROUTES on disk to the renderer registry.
 *
 *  The registry is `Partial` until Task 11 fills it, so TypeScript cannot catch a
 *  route that ships without a renderer — and that combination is the one real
 *  failure mode here: the page would render a cover block with no body, then
 *  PrintReady (which only looks for the ABSENCE of skeletons) would emit the ready
 *  sentinel immediately and AutoPrint would send a blank report to the printer.
 *  HubPrintPage/PortalPrintPage now fail closed on it, and this guard makes the
 *  precondition impossible in the first place.
 *
 *  Deliberately derived from the filesystem rather than hardcoded, so it stays
 *  correct at EVERY intermediate state as Tasks 11 and 12 add the ten remaining
 *  routes — unlike a static six-entry totality assertion, which is only true at
 *  the end. */
const ROUTE_ROOTS = [
  join(process.cwd(), "src/app/reports"),
  join(process.cwd(), "src/app/portal/reports"),
];

/** /reports/monthly/print predates this print layer entirely: it is the separate,
 *  token-authenticated monthly report (src/proxy.ts:15 exempts it from session
 *  auth) with its own document, stylesheet and AutoPrint. It is not a v2 report
 *  section and deliberately has no SECTION_RENDERERS entry. */
const NOT_A_V2_SECTION = new Set(["monthly"]);

function routedSectionIds(): { root: string; id: string }[] {
  const found: { root: string; id: string }[] = [];
  for (const root of ROUTE_ROOTS) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (NOT_A_V2_SECTION.has(entry.name)) continue;
      if (existsSync(join(root, entry.name, "print", "page.tsx"))) {
        found.push({ root, id: entry.name });
      }
    }
  }
  return found;
}

describe("print routes and the renderer registry", () => {
  it("finds the print routes on disk", () => {
    // Tripwire: if the scan silently matches nothing, every assertion below
    // becomes vacuously true.
    expect(routedSectionIds().length).toBeGreaterThan(0);
  });

  it("routes only sections the registry knows about", () => {
    for (const { root, id } of routedSectionIds()) {
      expect(isPrintSectionId(id), `${root}/${id}/print is not a known print section`).toBe(true);
    }
  });

  it("has a renderer for every section that has a print route", () => {
    for (const { root, id } of routedSectionIds()) {
      expect(
        typeof SECTION_RENDERERS[id as PrintSectionId],
        `${root}/${id}/print exists but SECTION_RENDERERS has no entry for "${id}"`,
      ).toBe("function");
    }
  });

  it("registers no renderer for a section id outside the registry", () => {
    for (const id of Object.keys(SECTION_RENDERERS)) {
      expect(isPrintSectionId(id)).toBe(true);
    }
  });
});
