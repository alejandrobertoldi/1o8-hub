import { describe, it, expect } from "vitest";
import { fieldMapFromRows } from "./alr-field-map-loader";

describe("fieldMapFromRows", () => {
  it("keys by alr_label, exposes general label + sb label", () => {
    const map = fieldMapFromRows([
      { generalLabel: "SKU", alrLabel: "seller-sku", sbLabel: "sku" },
      { generalLabel: "ASIN", alrLabel: "asin1", sbLabel: "asin" },
      { generalLabel: "ItemName", alrLabel: null, sbLabel: "item_name" },
    ]);
    expect(map["seller-sku"]).toEqual({ generalLabel: "SKU", sbLabel: "sku" });
    expect(map["asin1"]).toEqual({ generalLabel: "ASIN", sbLabel: "asin" });
    expect(Object.keys(map)).toHaveLength(2);
  });
});
