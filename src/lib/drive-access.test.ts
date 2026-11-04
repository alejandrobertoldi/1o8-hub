import { describe, it, expect, vi, beforeEach } from "vitest";

const { results } = vi.hoisted(() => ({ results: [] as unknown[][] }));

// Each select() resolves to the next queued result: legacy A+ lookup first, then A+ v2.
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const rows = results.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const k of ["from", "innerJoin", "where", "limit"]) chain[k] = () => chain;
      chain.then = (fn: (v: unknown) => unknown) => Promise.resolve(rows).then(fn);
      return chain;
    }),
  },
}));

import { canReadDriveFile, untrustedFileHeaders } from "./drive-access";

describe("canReadDriveFile", () => {
  beforeEach(() => {
    results.length = 0;
  });

  it("lets hub staff read without a lookup", async () => {
    expect(await canReadDriveFile({ role: "viewer" }, "f1")).toBe(true);
    expect(await canReadDriveFile({ role: "owner" }, "f1")).toBe(true);
  });

  it("refuses pending users and clients without a code", async () => {
    expect(await canReadDriveFile({ role: "pending" }, "f1")).toBe(false);
    expect(await canReadDriveFile({ role: "client", clientIdCode: null }, "f1")).toBe(false);
  });

  it("refuses a client whose content doesn't reference the file", async () => {
    results.push([], []);
    expect(await canReadDriveFile({ role: "client", clientIdCode: "ELK" }, "someone-elses")).toBe(false);
  });

  it("allows a client's own legacy A+ image or A+ v2 asset", async () => {
    results.push([{ id: "img" }]);
    expect(await canReadDriveFile({ role: "client", clientIdCode: "ELK" }, "f1")).toBe(true);
    results.push([], [{ id: "asset" }]);
    expect(await canReadDriveFile({ role: "prospect", clientIdCode: "ELK, SPF" }, "f2")).toBe(true);
  });
});

describe("untrustedFileHeaders", () => {
  it("renders plain images inline, sandboxed and unsniffed", () => {
    const h = untrustedFileHeaders("image/png", "a.png");
    expect(h["Content-Disposition"]).toBe('inline; filename="a.png"');
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });

  it("forces HTML and SVG to download, never inline", () => {
    for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", undefined]) {
      const h = untrustedFileHeaders(type, "x");
      expect(h["Content-Disposition"].startsWith("attachment")).toBe(true);
      expect(h["Content-Security-Policy"]).toContain("sandbox");
    }
  });

  it("strips parameters and quotes from type and filename", () => {
    const h = untrustedFileHeaders("text/html; charset=utf-8", 'evil".html');
    expect(h["Content-Type"]).toBe("text/html");
    expect(h["Content-Disposition"]).toBe('attachment; filename="evil_.html"');
  });
});
