import { describe, it, expect } from "vitest";
import { projectAsinList } from "./project-asin-list";

describe("projectAsinList", () => {
  const products = [
    { id: "p2", asin: "B1", sku: "FBA", summarizedTitle: "Short B1", itemName: "Long B1" },
    { id: "p1", asin: "B1", sku: "MFN", summarizedTitle: null, itemName: "Wrong record" },
    { id: "p3", asin: "B0", sku: "X", summarizedTitle: null, itemName: "Parent title" },
  ];
  it("groups per project, Parent first, picks the ASIN+SKU product, summarized title then item name", () => {
    const m = projectAsinList([
      { projectId: "A", asin: "B1", sku: "FBA", parentageLevel: "Child" },
      { projectId: "A", asin: "B0", sku: "X", parentageLevel: "Parent" },
      { projectId: "A", asin: "B1", sku: "FBA", parentageLevel: "Child" },
      { projectId: "B", asin: "B9", sku: "Z", parentageLevel: null },
    ], products);
    expect(m.get("A")).toEqual([
      { asin: "B0", sku: "X", parentage_level: "Parent", product_id: "p3", title: "Parent title" },
      { asin: "B1", sku: "FBA", parentage_level: "Child", product_id: "p2", title: "Short B1" },
    ]);
    expect(m.get("B")).toEqual([{ asin: "B9", sku: "Z", parentage_level: null, product_id: null, title: null }]);
  });
});

import { projectAsinListByClient } from "./project-asin-list";
describe("projectAsinListByClient", () => {
  it("matches products within each project's client only", () => {
    const m = projectAsinListByClient(
      [{ id: "A", clientIdCode: "C1" }, { id: "B", clientIdCode: "C2" }],
      [{ projectId: "A", asin: "B1", sku: "S", parentageLevel: "Child" }, { projectId: "B", asin: "B1", sku: "S", parentageLevel: "Child" }],
      [{ id: "p1", clientIdCode: "C1", asin: "B1", sku: "S", summarizedTitle: "C1 title", itemName: null },
       { id: "p2", clientIdCode: "C2", asin: "B1", sku: "S", summarizedTitle: "C2 title", itemName: null }],
    );
    expect(m.get("A")?.[0]).toMatchObject({ product_id: "p1", title: "C1 title" });
    expect(m.get("B")?.[0]).toMatchObject({ product_id: "p2", title: "C2 title" });
  });
});
