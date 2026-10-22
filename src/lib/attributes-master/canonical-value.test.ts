import { describe, it, expect } from "vitest";
import {
  canonicalScalarForProductType,
  canonicalArrayForProductType,
  canonicalValidValuesForProductType,
  canonicalScalarMap,
  canonicalArrayMap,
  isProductTypeExplicitlyKeyed,
  mergeCanonicalScalar,
  mergeCanonicalArray,
} from "./canonical-value";

describe("canonicalScalarForProductType", () => {
  it("returns null for null or empty input", () => {
    expect(canonicalScalarForProductType(null, "SAUCE")).toBeNull();
    expect(canonicalScalarForProductType("", "SAUCE")).toBeNull();
  });

  it("treats plain text as universal (legacy storage)", () => {
    expect(canonicalScalarForProductType("Required", "SAUCE")).toBe("Required");
    expect(canonicalScalarForProductType("Required", "ANYTHING")).toBe("Required");
  });

  it("returns the productType-specific value when the JSON object has the key", () => {
    const raw = '{"SAUCE":"Required","BABY_PRODUCT":"Optional"}';
    expect(canonicalScalarForProductType(raw, "SAUCE")).toBe("Required");
    expect(canonicalScalarForProductType(raw, "BABY_PRODUCT")).toBe("Optional");
  });

  it("falls back to the ALL key when productType key is missing", () => {
    expect(canonicalScalarForProductType('{"ALL":"Required"}', "SAUCE")).toBe("Required");
    expect(
      canonicalScalarForProductType('{"ALL":"Required","SAUCE":"Conditional"}', "BABY_PRODUCT")
    ).toBe("Required");
  });

  it("prefers the specific productType over ALL", () => {
    expect(
      canonicalScalarForProductType(
        '{"ALL":"Required","SAUCE":"Conditionally Required"}',
        "SAUCE"
      )
    ).toBe("Conditionally Required");
  });

  it("returns null when neither productType nor ALL key is present", () => {
    expect(canonicalScalarForProductType('{"SAUCE":"Required"}', "BABY_PRODUCT")).toBeNull();
  });

  it("returns null when the resolved value is not a string", () => {
    expect(canonicalScalarForProductType('{"SAUCE":42}', "SAUCE")).toBeNull();
    expect(canonicalScalarForProductType('{"SAUCE":["a","b"]}', "SAUCE")).toBeNull();
    expect(canonicalScalarForProductType('{"SAUCE":null}', "SAUCE")).toBeNull();
  });

  it("treats malformed JSON as plain text (universal)", () => {
    expect(canonicalScalarForProductType("Color of product", "SAUCE")).toBe(
      "Color of product"
    );
    expect(canonicalScalarForProductType('{"SAUCE":', "SAUCE")).toBe('{"SAUCE":');
  });
});

describe("canonicalArrayForProductType", () => {
  it("returns null for null or empty input", () => {
    expect(canonicalArrayForProductType(null, "SAUCE")).toBeNull();
    expect(canonicalArrayForProductType("", "SAUCE")).toBeNull();
  });

  it("returns null for plain text (legacy plain text is not an array)", () => {
    expect(canonicalArrayForProductType("Required", "SAUCE")).toBeNull();
  });

  it("returns the productType-specific array when the JSON object has the key", () => {
    const raw = '{"SAUCE":["red","blue"],"BABY_PRODUCT":["white"]}';
    expect(canonicalArrayForProductType(raw, "SAUCE")).toEqual(["red", "blue"]);
    expect(canonicalArrayForProductType(raw, "BABY_PRODUCT")).toEqual(["white"]);
  });

  it("falls back to ALL when productType key is missing", () => {
    expect(canonicalArrayForProductType('{"ALL":["x","y"]}', "SAUCE")).toEqual(["x", "y"]);
  });

  it("returns null when key absent and no ALL fallback", () => {
    expect(canonicalArrayForProductType('{"SAUCE":["a"]}', "BABY_PRODUCT")).toBeNull();
  });

  it("returns null when the resolved value is not an array of strings", () => {
    expect(canonicalArrayForProductType('{"SAUCE":"red"}', "SAUCE")).toBeNull();
    expect(canonicalArrayForProductType('{"SAUCE":["red",42]}', "SAUCE")).toBeNull();
    expect(canonicalArrayForProductType('{"SAUCE":null}', "SAUCE")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(canonicalArrayForProductType('{"SAUCE":[', "SAUCE")).toBeNull();
  });
});

describe("canonicalValidValuesForProductType (backwards-compat re-export)", () => {
  it("matches canonicalArrayForProductType behaviour", () => {
    expect(canonicalValidValuesForProductType('{"SAUCE":["red"]}', "SAUCE")).toEqual(["red"]);
    expect(canonicalValidValuesForProductType(null, "SAUCE")).toBeNull();
    expect(canonicalValidValuesForProductType("Required", "SAUCE")).toBeNull();
  });
});

describe("canonicalScalarMap", () => {
  it("returns null for null/empty input", () => {
    expect(canonicalScalarMap(null)).toBeNull();
    expect(canonicalScalarMap("")).toBeNull();
  });

  it("wraps plain text into an ALL entry", () => {
    expect(canonicalScalarMap("Required")).toEqual({ ALL: "Required" });
  });

  it("returns the full per-productType scalar map", () => {
    expect(canonicalScalarMap('{"SAUCE":"Required","BABY_PRODUCT":"Optional"}')).toEqual({
      SAUCE: "Required",
      BABY_PRODUCT: "Optional",
    });
  });

  it("drops non-string entries from the map", () => {
    expect(canonicalScalarMap('{"SAUCE":"Required","BAD":42,"ALSO_BAD":["a"]}')).toEqual({
      SAUCE: "Required",
    });
  });

  it("returns null when the JSON object yields no string entries", () => {
    expect(canonicalScalarMap('{"SAUCE":42}')).toBeNull();
  });
});

describe("canonicalArrayMap", () => {
  it("returns null for null/empty input", () => {
    expect(canonicalArrayMap(null)).toBeNull();
    expect(canonicalArrayMap("")).toBeNull();
  });

  it("returns null for plain-text input (arrays are JSON-only)", () => {
    expect(canonicalArrayMap("Required")).toBeNull();
  });

  it("returns the full per-productType array map", () => {
    expect(canonicalArrayMap('{"SAUCE":["red","blue"],"BABY_PRODUCT":["white"]}')).toEqual({
      SAUCE: ["red", "blue"],
      BABY_PRODUCT: ["white"],
    });
  });

  it("drops non-array or mixed-type entries", () => {
    expect(canonicalArrayMap('{"SAUCE":["red"],"BAD":"oops","MIXED":["a",42]}')).toEqual({
      SAUCE: ["red"],
    });
  });
});

describe("isProductTypeExplicitlyKeyed", () => {
  it("returns false for null or plain text", () => {
    expect(isProductTypeExplicitlyKeyed(null, "SAUCE")).toBe(false);
    expect(isProductTypeExplicitlyKeyed("", "SAUCE")).toBe(false);
    expect(isProductTypeExplicitlyKeyed("Required", "SAUCE")).toBe(false);
  });

  it("returns true when productType is an explicit top-level JSON key", () => {
    expect(isProductTypeExplicitlyKeyed('{"SAUCE":"Required"}', "SAUCE")).toBe(true);
    expect(
      isProductTypeExplicitlyKeyed(
        '{"SAUCE":"Required","BABY_PRODUCT":"Optional"}',
        "BABY_PRODUCT",
      ),
    ).toBe(true);
  });

  it("returns false when productType is missing, even if ALL is present", () => {
    expect(isProductTypeExplicitlyKeyed('{"ALL":"Required"}', "SAUCE")).toBe(false);
    expect(isProductTypeExplicitlyKeyed('{"SAUCE":"Required"}', "BABY_PRODUCT")).toBe(false);
  });
});

describe("mergeCanonicalScalar", () => {
  it("creates a new JSON object when canonical is null", () => {
    expect(mergeCanonicalScalar(null, "SAUCE", "Required")).toBe(
      JSON.stringify({ SAUCE: "Required" }),
    );
  });

  it("promotes legacy plain text to ALL and adds the productType key", () => {
    expect(mergeCanonicalScalar("Required", "SAUCE", "Optional")).toBe(
      JSON.stringify({ ALL: "Required", SAUCE: "Optional" }),
    );
  });

  it("merges the productType key into an existing JSON object", () => {
    expect(
      mergeCanonicalScalar(
        '{"SAUCE":"Required"}',
        "BABY_PRODUCT",
        "Optional",
      ),
    ).toBe(JSON.stringify({ SAUCE: "Required", BABY_PRODUCT: "Optional" }));
  });

  it("overwrites an existing productType key (caller is expected to gate)", () => {
    expect(mergeCanonicalScalar('{"SAUCE":"Required"}', "SAUCE", "Optional")).toBe(
      JSON.stringify({ SAUCE: "Optional" }),
    );
  });
});

describe("mergeCanonicalArray", () => {
  it("creates a new JSON object when canonical is null", () => {
    expect(mergeCanonicalArray(null, "SAUCE", ["red", "blue"])).toBe(
      JSON.stringify({ SAUCE: ["red", "blue"] }),
    );
  });

  it("merges the productType key into an existing JSON object", () => {
    expect(
      mergeCanonicalArray(
        '{"SAUCE":["red","blue"]}',
        "BABY_PRODUCT",
        ["small", "large"],
      ),
    ).toBe(
      JSON.stringify({
        SAUCE: ["red", "blue"],
        BABY_PRODUCT: ["small", "large"],
      }),
    );
  });
});
