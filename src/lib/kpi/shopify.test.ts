import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeShop, parseShopifyTable, verifyShopifyHmac } from "./shopify";

describe("normalizeShop", () => {
  it("accepts the myshopify domain in any shape, and admin URLs", () => {
    expect(normalizeShop("ELK-9957.myshopify.com/")).toBe("elk-9957.myshopify.com");
    expect(normalizeShop("https://admin.shopify.com/store/elk-9957/orders")).toBe("elk-9957.myshopify.com");
    expect(normalizeShop("elkwellness.com")).toBeNull();
    expect(normalizeShop("")).toBeNull();
  });
});

describe("verifyShopifyHmac", () => {
  it("checks Shopify's signature over the sorted query", () => {
    const secret = "shh";
    const message = "code=abc&shop=elk-9957.myshopify.com&state=s1&timestamp=1";
    const hmac = createHmac("sha256", secret).update(message).digest("hex");
    const params = new URLSearchParams({ shop: "elk-9957.myshopify.com", code: "abc", state: "s1", timestamp: "1", hmac });
    expect(verifyShopifyHmac(params, secret)).toBe(true);
    params.set("code", "tampered");
    expect(verifyShopifyHmac(params, secret)).toBe(false);
  });
});

describe("parseShopifyTable", () => {
  it("reads daily rows and renames / filters by customer type", () => {
    const table = {
      rows: [
        { day: "2026-10-01", customer_type: "First-time", net_sales: "120.50", orders: "3" },
        { day: "2026-10-01", customer_type: "Returning", net_sales: "300", orders: "5" },
      ],
    };
    expect(parseShopifyTable(table, ["net_sales", "orders"], (m) => (m === "orders" ? "new_customers" : "new_customer_sales"), (r) => /first/i.test(String(r.customer_type)))).toEqual([
      { day: "2026-10-01", metric: "new_customer_sales", value: 120.5 },
      { day: "2026-10-01", metric: "new_customers", value: 3 },
    ]);
  });
});
