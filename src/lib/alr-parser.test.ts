import { describe, it, expect } from "vitest";
import { parseAlr, alrRowToMasterFields } from "./alr-parser";
import { fieldMapFromRows } from "./alr-field-map-loader";

const HEADER =
  "item-name\titem-description\tlisting-id\tseller-sku\tprice\tquantity\tasin1\tstatus\tfulfillment-channel\topen-date\timage-url";

// Mirrors the SB labels in alr-parser's SB_TO_CORE_FIELD map. New ALR-mapped
// attributes that should land on master core columns must show up here AND in
// SB_TO_CORE_FIELD; otherwise the value falls through to rawColumnValues only.
const FIXTURE_FIELD_MAP = fieldMapFromRows([
  { generalLabel: "SKU", alrLabel: "seller-sku", sbLabel: "sku" },
  { generalLabel: "ASIN", alrLabel: "asin1", sbLabel: "asin" },
  { generalLabel: "ItemName", alrLabel: "item-name", sbLabel: "item_name" },
  { generalLabel: "Status", alrLabel: "status", sbLabel: "status" },
  { generalLabel: "MainImageURL", alrLabel: "image-url", sbLabel: "main_image_url" },
  { generalLabel: "ListPrice", alrLabel: "price", sbLabel: "list_price" },
]);

function tsv(rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("parseAlr", () => {
  it("parses header row and a single Active listing", () => {
    const text = tsv([
      "Apollo Hat Black\tA classic black hat\tLISTING-1\tAPOLLO-HAT-BLK\t29.99\t12\tB000111111\tActive\tAMAZON_NA\t2024-01-01\thttps://m.media-amazon.com/images/I/abc.jpg",
    ]);
    const rows = parseAlr(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      itemName: "Apollo Hat Black",
      itemDescription: "A classic black hat",
      listingId: "LISTING-1",
      sellerSku: "APOLLO-HAT-BLK",
      price: "29.99",
      quantity: "12",
      asin1: "B000111111",
      status: "Active",
      fulfillmentChannel: "AMAZON_NA",
      openDate: "2024-01-01",
      imageUrl: "https://m.media-amazon.com/images/I/abc.jpg",
      raw: {
        "item-name": "Apollo Hat Black",
        "item-description": "A classic black hat",
        "listing-id": "LISTING-1",
        "seller-sku": "APOLLO-HAT-BLK",
        price: "29.99",
        quantity: "12",
        asin1: "B000111111",
        status: "Active",
        "fulfillment-channel": "AMAZON_NA",
        "open-date": "2024-01-01",
        "image-url": "https://m.media-amazon.com/images/I/abc.jpg",
      },
      rowIndex: 0,
    });
  });
});

describe("parseAlr edge cases", () => {
  it("throws on empty input", () => {
    expect(() => parseAlr("")).toThrow(/empty/i);
  });

  it("throws when required columns are missing", () => {
    expect(() => parseAlr("item-name\tprice\nfoo\t1.00")).toThrow(/seller-sku/);
  });

  it("skips blank trailing lines", () => {
    const text = tsv([
      "X\t\t\tSKU1\t\t\tB1\tActive\t\t\t",
      "",
      "",
    ]);
    const rows = parseAlr(text);
    expect(rows).toHaveLength(1);
  });

  it("parses Inactive and Incomplete (parent variation) rows", () => {
    const text = tsv([
      "Apollo Hat\t\t\tAPOLLO-HAT\t\t\t\tIncomplete\t\t\t",
      "Old Hat\t\t\tOLD-HAT\t\t\tB000222\tInactive\t\t\t",
    ]);
    const rows = parseAlr(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("Incomplete");
    expect(rows[0].asin1).toBe(""); // parent variation has no ASIN
    expect(rows[1].status).toBe("Inactive");
  });

  it("handles row with blank ASIN (parent variation placeholder)", () => {
    const text = tsv([
      "Structured Visor\t\t\tSTRUCTUREDVISOR\t\t\t\tIncomplete\t\t\t",
    ]);
    const rows = parseAlr(text);
    expect(rows[0].asin1).toBe("");
    expect(rows[0].sellerSku).toBe("STRUCTUREDVISOR");
  });

  it("strips a UTF-8 BOM from the start of the file", () => {
    const text = "﻿" + tsv([
      "Apollo Hat\t\tL1\tSKU1\t10.00\t5\tB000111\tActive\tAMAZON_NA\t2024-01-01\thttps://img/a.jpg",
    ]);
    const rows = parseAlr(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].itemName).toBe("Apollo Hat");
    expect(rows[0].sellerSku).toBe("SKU1");
  });

  it("parses CRLF line endings the same as LF", () => {
    const lf = tsv([
      "Apollo Hat\t\tL1\tSKU1\t10.00\t5\tB000111\tActive\tAMAZON_NA\t2024-01-01\thttps://img/a.jpg",
    ]);
    const crlf = lf.replace(/\n/g, "\r\n");
    const rowsLf = parseAlr(lf);
    const rowsCrlf = parseAlr(crlf);
    expect(rowsCrlf).toEqual(rowsLf);
  });
});

describe("alrRowToMasterFields", () => {
  it("maps ALR row to master core fields with US default marketplace", () => {
    const text = tsv([
      "Apollo Hat\tA hat\tL1\tSKU1\t10.00\t5\tB000111\tActive\tAMAZON_NA\t2024-01-01\thttps://img/a.jpg",
    ]);
    const [row] = parseAlr(text);
    expect(alrRowToMasterFields(row, FIXTURE_FIELD_MAP)).toEqual({
      asin: "B000111",
      sku: "SKU1",
      marketplace: "US",
      status: "Active",
      itemName: "Apollo Hat",
      mainImageUrl: "https://img/a.jpg",
      listPrice: "10.00",
      rawColumnValues: row.raw,
    });
  });

  it("returns null for blank ASIN/SKU (parent variations)", () => {
    const text = tsv([
      "Apollo Hat\t\t\t\t\t\t\tIncomplete\t\t\t",
    ]);
    const [row] = parseAlr(text);
    const fields = alrRowToMasterFields(row, FIXTURE_FIELD_MAP);
    expect(fields.asin).toBe(null);
    expect(fields.sku).toBe(null);
    expect(fields.itemName).toBe("Apollo Hat");
  });
});
