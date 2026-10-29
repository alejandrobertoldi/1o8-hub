import { describe, expect, it } from "vitest";
import { kpisSheetText, parseClientKpis, serializeClientKpis, suggestKpisFromText } from "./kpis";

describe("suggestKpisFromText", () => {
  it("maps the usual e-commerce trio in order", () => {
    const text = "1- Net Sales\n2 - Conversion Rate\n3- Blended ROAS (Total Maketing Dolars over Spent) - Website";
    expect(suggestKpisFromText(text).map((k) => k.key)).toEqual(["net_sales", "conversion_rate", "blended_roas"]);
  });

  it("keeps the most specific ROAS and skips empty or dash cells", () => {
    expect(suggestKpisFromText("Instacart ROAS \nTarget ROAS").map((k) => k.key)).toEqual(["instacart_roas", "target_roas"]);
    expect(suggestKpisFromText("Blended DTC ROAS\nNon-Sale Prospecting ROAS").map((k) => k.key)).toEqual(["blended_roas", "prospecting_roas"]);
    expect(suggestKpisFromText("-")).toEqual([]);
    expect(suggestKpisFromText(undefined)).toEqual([]);
  });

  it("finds CAC and new customer sales", () => {
    expect(suggestKpisFromText("1 - CAC USA - CAC Canada\n2 - New Users Sales").map((k) => k.key)).toEqual(["cac", "new_customer_sales"]);
  });
});

describe("kpisSheetText / parseClientKpis", () => {
  it("writes a numbered list with notes and targets, and round-trips the JSON", () => {
    const kpis = [{ key: "net_sales", target: "$150k / mo" }, { key: "cac", note: "USA and Canada" }, { key: "custom", label: "Wholesale accounts" }];
    expect(kpisSheetText(kpis)).toBe("1- Net Sales · target $150k / mo\n2- CAC (USA and Canada)\n3- Wholesale accounts");
    expect(parseClientKpis(serializeClientKpis(kpis))).toEqual(kpis);
  });

  it("ignores junk", () => {
    expect(parseClientKpis("not json")).toEqual([]);
    expect(parseClientKpis('[{"nokey":1}, {"key":"orders"}]')).toEqual([{ key: "orders" }]);
  });
});
