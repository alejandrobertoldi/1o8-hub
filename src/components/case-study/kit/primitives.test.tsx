import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DeckContext, Copy, Val, SlotImage, Bottombar, Metric, formatPeriod, type DeckCtx } from "./primitives";

const ctx = (over: Partial<DeckCtx> = {}): DeckCtx => ({ format: "detailed", clientName: "Acme", period: "Oct 2025 – Sep 2026",
  periodShort: "FY26", contactEmail: "hello@marketfoundry.com", editing: false, slideNo: 3, slideTotal: 14,
  tokens: { client: "Acme", period: "Oct 2025 – Sep 2026", total: "$1,234" }, ...over });
const wrap = (el: React.ReactNode, c = ctx()) => render(<DeckContext.Provider value={c}>{el}</DeckContext.Provider>);
const content = { copy: { a: "Hi {client}, {total}", empty: "" }, designImages: { s: ["/d.png"], e: [] }, manualImages: { m: ["https://m.png"] } };
const slot = (id: string) => ({ id, label: "L", fit: "cover" as const, group: "g", from: () => [] });

describe("primitives", () => {
  it("Copy fills tokens; empty copy shows a chip only while editing", () => {
    expect(wrap(<Copy content={content} k="a" />).container.textContent).toBe("Hi Acme, $1,234");
    expect(wrap(<Copy content={content} k="empty" />).container.textContent).toBe("");
    expect(wrap(<Copy content={content} k="empty" />, ctx({ editing: true })).container.querySelector(".cs-missing")).toBeTruthy();
  });
  it("Val shows a chip when missing & editing, a dash in export", () => {
    expect(wrap(<Val v="—" missing />, ctx({ editing: true })).container.querySelector(".cs-missing")).toBeTruthy();
    expect(wrap(<Val v="—" missing />).container.textContent).toBe("—");
  });
  it("SlotImage: design image, manual tag, empty placeholder only while editing", () => {
    const d = wrap(<SlotImage content={content} slot={slot("s")} />).container;
    expect(d.querySelector("img")?.getAttribute("src")).toBe("/d.png");
    const m = wrap(<SlotImage content={content} slot={slot("m")} />, ctx({ editing: true })).container;
    expect(m.querySelector(".cs-manual-tag")?.textContent).toMatch(/manual/i);
    expect(wrap(<SlotImage content={content} slot={slot("e")} />, ctx({ editing: true })).container.querySelector(".cs-slot.empty")).toBeTruthy();
    expect(wrap(<SlotImage content={content} slot={slot("e")} />).container.querySelector("span")).toBeNull();
  });
  it("SlotImage: print mode rewrites all four Design proxies to the 1600px print-image route; screen mode does not", () => {
    const proxies = [
      "/api/design/listing-images/image?driveFileId=g1",
      "/api/storefront/image?driveFileId=g2",
      "/api/aplus2/image?driveFileId=g3",
      "/api/design-status/brand-story-image?driveFileId=g4",
    ];
    const c = { copy: {}, designImages: { p: proxies }, manualImages: { m: ["https://example.com/x.jpg"] } };
    const srcs = (el: HTMLElement) => Array.from(el.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs(wrap(<SlotImage content={c} slot={slot("p")} />, ctx({ print: true })).container)).toEqual(
      ["g1", "g2", "g3", "g4"].map((g) => `/api/case-studies/print-image?driveFileId=${g}&w=1600`));
    expect(srcs(wrap(<SlotImage content={c} slot={slot("p")} />).container)).toEqual(proxies);
    expect(srcs(wrap(<SlotImage content={c} slot={slot("m")} />, ctx({ print: true })).container)).toEqual(["https://example.com/x.jpg"]);
  });
  it("Bottombar numbers the slide", () => {
    expect(wrap(<Bottombar />).container.textContent).toContain("03 / 14");
  });
  it("Metric splits units", () => {
    const el = wrap(<Metric value="$64.6K" />).container;
    expect(el.querySelector(".unit")?.textContent).toBe("K");
    expect(el.textContent).toBe("$64.6K");
  });
  it("formatPeriod", () => {
    expect(formatPeriod("2025-10-01", "2026-09-30")).toBe("Oct 2025 – Sep 2026");
    expect(formatPeriod("2026-01-01", "2026-01-31")).toBe("Jan 2026");
  });
});
