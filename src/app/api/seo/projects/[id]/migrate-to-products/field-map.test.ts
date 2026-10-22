import { describe, it, expect } from "vitest";
import { FIELD_MAP, extractMappedFields } from "./field-map";

describe("migrate-to-products FIELD_MAP", () => {
  it("maps Title to core.itemName", () => {
    expect(FIELD_MAP.Title).toEqual({ target: "core", field: "itemName" });
  });
  it("maps ItemHighlight to core.itemHighlight", () => {
    expect(FIELD_MAP.ItemHighlight).toEqual({ target: "core", field: "itemHighlight" });
  });
  it("extracts ItemHighlight from generatedContent", () => {
    const m = extractMappedFields({ Title: "T", ItemHighlight: "Breathable Mesh, All-Day Comfort" });
    expect(m.get("ItemHighlight")).toMatchObject({ target: "core", field: "itemHighlight", value: "Breathable Mesh, All-Day Comfort" });
  });
});
