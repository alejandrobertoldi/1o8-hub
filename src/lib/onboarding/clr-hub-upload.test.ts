import { describe, it, expect } from "vitest";
import { planClrListingsForHub } from "./clr-hub-upload";
import type { ParsedClrRow } from "@/lib/clr-row-parser";

const ITEM =
  "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value";

function clr(
  sku: string,
  overrides: Partial<ParsedClrRow> = {}
): ParsedClrRow {
  return {
    sku,
    productType: "GROCERY",
    attributes: { [ITEM]: `${sku} title` },
    requiredComplete: true,
    ...overrides,
  };
}

describe("planClrListingsForHub", () => {
  it("joins CLR SKU to ALR seller-sku for ASIN", () => {
    const plan = planClrListingsForHub(
      [clr("AR12PCK"), clr("MISSING")],
      [
        { sku: "ar12pck", asin: "B00TEST123" },
        { sku: "OTHER", asin: "B00OTHER99" },
      ],
      []
    );
    expect(plan.hasAlr).toBe(true);
    expect(plan.matched).toEqual([
      {
        sku: "AR12PCK",
        productType: "GROCERY",
        asin: "B00TEST123",
        itemName: "AR12PCK title",
        inHub: false,
      },
    ]);
    expect(plan.unmatched).toEqual([
      {
        sku: "MISSING",
        productType: "GROCERY",
        itemName: "MISSING title",
      },
    ]);
  });

  it("flags SKUs already in the Hub", () => {
    const plan = planClrListingsForHub(
      [clr("SKU-1")],
      [{ sku: "SKU-1", asin: "B00TEST123" }],
      ["sku-1"]
    );
    expect(plan.matched[0].inHub).toBe(true);
  });

  it("ignores ALR rows without a 10-character ASIN", () => {
    const plan = planClrListingsForHub(
      [clr("SKU-1")],
      [{ sku: "SKU-1", asin: "SHORT" }],
      []
    );
    expect(plan.matched).toEqual([]);
    expect(plan.unmatched.map((row) => row.sku)).toEqual(["SKU-1"]);
  });
});
