import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("./google", () => ({}));
import { sheetLinksByCode } from "./sync";
import type { SheetRow } from "./columns";

const row = (rowNumber: number, code: string): SheetRow => ({ rowNumber, code, name: code, values: {} });

describe("sheetLinksByCode", () => {
  it("reads the SOW document and the Asana project from the sheet's links", () => {
    const out = sheetLinksByCode([row(4, "kss"), row(5, "MSN"), row(6, ""), row(7, "BRN")], {
      sow: new Map([[4, "https://drive.google.com/file/d/abc/view"], [6, "https://x"]]),
      code: new Map([
        [4, "https://app.asana.com/1/1165458906651074/project/1211721895488904/list/1211725726413186"],
        [5, "https://app.asana.com/0/1217003389291688/list"],
        [7, "https://example.com/not-asana"],
      ]),
    });
    expect(out.get("KSS")).toEqual({ sowUrl: "https://drive.google.com/file/d/abc/view", asanaGid: "1211721895488904" });
    expect(out.get("MSN")).toEqual({ sowUrl: null, asanaGid: "1217003389291688" });
    // A row without a code, or with nothing useful, is skipped.
    expect(out.has("BRN")).toBe(false);
    expect(out.size).toBe(2);
  });
});
