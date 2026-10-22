import { describe, expect, it } from "vitest";
import { parseAddress, parseAmzPrepSheets } from "./parse-amzprep";

const HEADER = ["Location", "Code", "Type", "Address"];
const tab = (name: string, rows: unknown[][]) => ({ tab: name, rows: [["title"], [name], HEADER, ...rows] });

describe("parseAddress", () => {
  it("reads state + zip + city from a standard US address", () => {
    expect(parseAddress("975 Powder Plant Rd, Bessemer, AL 35022, United States")).toEqual({
      region: "AL", city: "Bessemer", postalCode: "35022",
    });
  });
  it("reads a full state name", () => {
    expect(parseAddress("46724 Lakeview Blvd, Fremont, California, US")?.region).toBe("CA");
  });
  it("ignores a trailing dash-suffix and ZIP+4", () => {
    expect(parseAddress("555 East Orange Show Rd. San Bernardino, CA 92408-2453 – San Bernardino County")).toMatchObject({
      region: "CA", postalCode: "92408",
    });
  });
  it("does not mistake a highway like IN-62 for the state when the state comes later", () => {
    expect(parseAddress("3101 IN-62, Mt Vernon, IN")).toEqual({ region: "IN", city: "Mt Vernon", postalCode: null });
  });
  it("reads a Canadian province and postal code", () => {
    expect(parseAddress("293069 Col Robertson Way, Rocky View County, AB T4A 1C6, Canada")).toEqual({
      region: "AB", city: "Rocky View County", postalCode: "T4A 1C6",
    });
  });
  it("reads a full state name followed by a 9-digit ZIP", () => {
    expect(parseAddress("191 Norfolk Southern Way, Chickasaw Trails Industrial Park Byhalia, Mississippi 386112306 , Marshall County")).toMatchObject({
      region: "MS", postalCode: "38611",
    });
  });
  it("reads a province name followed by a postal code in the same segment", () => {
    expect(parseAddress("450 Derwent PL Delta, British Columbia V3M 5Y9")).toMatchObject({ region: "BC", postalCode: "V3M 5Y9" });
  });
  it("finds 'ST 12345' inside a comma-less address", () => {
    expect(parseAddress("Grant Street Thornton CO 80023-6622")).toMatchObject({ region: "CO", postalCode: "80023" });
  });
  it("does not read a county named after a state as the state", () => {
    expect(parseAddress("13905 Crayton Blvd, Hagerstown, Maryland 21742 , Washington County")).toMatchObject({
      region: "MD", city: "Hagerstown", postalCode: "21742",
    });
  });
  it("returns null when there is no region", () => {
    expect(parseAddress("Somewhere Road")).toBeNull();
  });
});

describe("parseAmzPrepSheets", () => {
  it("trusts the address over a wrong state column and records the correction", () => {
    const r = parseAmzPrepSheets([tab("USA Locations", [["Alabama", "DPX7", null, "3405 S. McQueen Rd, Chandler, AZ"]])]);
    expect(r.records[0]).toMatchObject({ code: "DPX7", country: "US", region: "AZ", city: "Chandler" });
    expect(r.corrected).toHaveLength(1);
  });

  it("files a Canadian row from the US tab as CA and collapses the Canada-tab duplicate", () => {
    const row = ["Alberta", "YYC1", "FC", "293069 Col Robertson Way, Rocky View County, AB T4A 1C6, Canada"];
    const r = parseAmzPrepSheets([tab("USA Locations", [row]), tab("Canada Locations", [row])]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ country: "CA", region: "AB" });
    expect(r.conflicts).toHaveLength(0);
  });

  it("rejects TBD, numeric junk and repeated header rows", () => {
    const r = parseAmzPrepSheets([
      tab("USA Locations", [
        ["Maryland", "TBD", null, "1600 Sparrow Point, Dundalk, MD"],
        ["MaryLand", "44621", null, "4200 Guilford Dr, College Park, MD"],
        ["State", "Code", "Type", "Address"],
      ]),
    ]);
    expect(r.records).toHaveLength(0);
    expect(r.rejected.map((x) => x.code)).toEqual(["TBD", "44621"]);
  });

  it("un-swaps a row whose code and state cells are reversed", () => {
    const r = parseAmzPrepSheets([tab("USA Locations", [["MDW3", "Illinois", "FC", "809 S Wright St, Champaign, IL 61820, United States"]])]);
    expect(r.records[0]).toMatchObject({ code: "MDW3", region: "IL", facilityType: "FC" });
  });

  it("strips footnote marks from codes", () => {
    const r = parseAmzPrepSheets([tab("USA Locations", [["Washington", "*XFR", "FC", "2021 7th Avenue, Seattle, WA, 98121"]])]);
    expect(r.records[0]).toMatchObject({ code: "XFR", region: "WA" });
  });

  it("applies a known fix when the address has no state and the column is wrong", () => {
    const r = parseAmzPrepSheets([tab("USA Locations", [["Minnesota", "CLE1", null, "4641 Warrensville Ce… North Randall, 44128"]])]);
    expect(r.records[0]).toMatchObject({ code: "CLE1", region: "OH", postalCode: "44128" });
  });

  it("falls back to the state column when the address is missing", () => {
    const r = parseAmzPrepSheets([tab("Canada Locations", [["Ontario", "YYZ10", "FC", null]])]);
    expect(r.records[0]).toMatchObject({ code: "YYZ10", country: "CA", region: "ON", address: null });
    expect(r.regionFromColumn).toHaveLength(1);
  });

  it("keeps the first of two conflicting rows for one code and reports it", () => {
    const r = parseAmzPrepSheets([
      tab("USA Locations", [
        ["Texas", "ABC1", "FC", "1 Main St, Dallas, TX 75001"],
        ["Ohio", "ABC1", "FC", "2 Elm St, Columbus, OH 43004"],
      ]),
    ]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].region).toBe("TX");
    expect(r.conflicts).toHaveLength(1);
  });
});
