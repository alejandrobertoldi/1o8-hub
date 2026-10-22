import { describe, it, expect } from "vitest";
import { clrAttributesToBqRow, type Alias } from "./clr-attribute-aliases";

const US = "ATVPDKIKX0DER";
const CA = "A2EUQ1WTGCTBG2";

// Marketplace + language wildcard fragments used in regex literals below.
const MP = `\\[marketplace_id=[^\\]]+\\]`;
const LANG = `\\[language_tag=[^\\]]+\\]`;

// Fixture lifted verbatim from the original ALIASES array in
// clr-attribute-aliases.ts (pre-2026-05-01 attributes table unification).
// Tests assert this canonical alias set; refactor must preserve behavior
// when this exact fixture is passed in as the second argument.
const FIXTURE_ALIASES: Alias[] = [
  // ── Product Identity ──
  { bqName: "SKU", patterns: [/^contribution_sku#1\.value$/] },
  {
    bqName: "ProductIdType",
    patterns: [/^amzn\d+\.volt\.[a-z]{2}\.product_id_type$/i],
  },
  {
    bqName: "ProductId",
    patterns: [/^amzn\d+\.volt\.[a-z]{2}\.product_id_value$/i],
  },
  {
    bqName: "ParentageLevel",
    patterns: [new RegExp(`^parentage_level${MP}#1\\.value$`)],
  },
  {
    bqName: "ParentSKU",
    patterns: [
      new RegExp(`^child_parent_sku_relationship${MP}#1\\.parent_sku$`),
    ],
  },
  {
    bqName: "ChildRelationshipType",
    patterns: [
      new RegExp(
        `^child_parent_sku_relationship${MP}#1\\.child_relationship_type$`
      ),
    ],
  },
  { bqName: "VariationThemeName", patterns: [/^variation_theme#1\.name$/] },
  { bqName: "Status", patterns: [/^::listing_status$/] },

  // ── Brand & Title ──
  {
    bqName: "BrandName",
    patterns: [new RegExp(`^brand${MP}${LANG}#1\\.value$`)],
  },
  {
    bqName: "ItemName",
    patterns: [new RegExp(`^item_name${MP}${LANG}#1\\.value$`)],
  },
  { bqName: "ProductType", patterns: [/^product_type#1\.value$/] },
  { bqName: "FeedProductType", patterns: [/^feed_product_type$/] },

  // ── Manufacturer ──
  {
    bqName: "Manufacturer",
    patterns: [new RegExp(`^manufacturer${MP}${LANG}#1\\.value$`)],
  },
  {
    bqName: "PartNumber",
    patterns: [new RegExp(`^part_number${MP}#1\\.value$`)],
  },
  {
    bqName: "ModelName",
    patterns: [new RegExp(`^model_name${MP}${LANG}#1\\.value$`)],
  },
  {
    bqName: "ModelNumber",
    patterns: [new RegExp(`^model_number${MP}#1\\.value$`)],
  },

  // ── Pricing ──
  {
    bqName: "ListPrice",
    patterns: [new RegExp(`^list_price${MP}#1\\.value$`)],
  },
  {
    bqName: "OurPrice",
    patterns: [
      new RegExp(
        `^purchasable_offer${MP}\\[audience=ALL\\]#1\\.our_price#1\\.schedule#1\\.value_with_tax$`
      ),
    ],
  },

  // ── Classification ──
  {
    bqName: "ItemTypeKeyword",
    patterns: [new RegExp(`^item_type_keyword${MP}#1\\.value$`)],
  },
  {
    bqName: "GenericKeywords",
    patterns: [new RegExp(`^generic_keyword${MP}${LANG}#\\d+\\.value$`)],
    multi: "concat",
  },
  {
    bqName: "PlatinumKeywords",
    patterns: [new RegExp(`^platinum_keyword${MP}${LANG}#\\d+\\.value$`)],
    multi: "concat",
  },

  // ── Images ──
  {
    bqName: "MainImageURL",
    patterns: [
      new RegExp(`^main_product_image_locator${MP}#1\\.media_location$`),
    ],
  },
  ...Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    return {
      bqName: `OtherImageURL${n}`,
      patterns: [
        new RegExp(`^other_product_image_locator_${n}${MP}#1\\.media_location$`),
      ],
    };
  }),
  {
    bqName: "SwatchImageURL",
    patterns: [
      new RegExp(`^swatch_product_image_locator${MP}#1\\.media_location$`),
    ],
  },

  // ── Bullet Points (split per index into BulletPoint1..BulletPoint5) ──
  ...Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    return {
      bqName: `BulletPoint${n}`,
      patterns: [new RegExp(`^bullet_point${MP}${LANG}#${n}\\.value$`)],
    };
  }),

  // ── Description ──
  {
    bqName: "ProductDescription",
    patterns: [new RegExp(`^product_description${MP}${LANG}#1\\.value$`)],
  },

  // ── Product Attributes ──
  { bqName: "Color", patterns: [new RegExp(`^color${MP}${LANG}#1\\.value$`)] },
  { bqName: "Size", patterns: [new RegExp(`^size${MP}${LANG}#1\\.value$`)] },
  {
    bqName: "Material",
    patterns: [new RegExp(`^material${MP}${LANG}#1\\.value$`)],
  },
  { bqName: "Style", patterns: [new RegExp(`^style${MP}${LANG}#1\\.value$`)] },
  {
    bqName: "Pattern",
    patterns: [new RegExp(`^pattern${MP}${LANG}#1\\.value$`)],
  },
  {
    bqName: "FabricType",
    patterns: [new RegExp(`^fabric_type${MP}${LANG}#1\\.value$`)],
  },
  { bqName: "Flavor", patterns: [new RegExp(`^flavor${MP}${LANG}#1\\.value$`)] },
  {
    bqName: "TargetGender",
    patterns: [new RegExp(`^target_gender${MP}#1\\.value$`)],
  },
  {
    bqName: "AgeRangeDescription",
    patterns: [new RegExp(`^age_range_description${MP}${LANG}#1\\.value$`)],
  },
  {
    bqName: "Department",
    patterns: [new RegExp(`^department${MP}${LANG}#1\\.value$`)],
  },
  {
    bqName: "CountryOfOrigin",
    patterns: [new RegExp(`^country_of_origin${MP}#1\\.value$`)],
  },
  {
    bqName: "CareInstructions",
    patterns: [new RegExp(`^care_instructions${MP}${LANG}#1\\.value$`)],
  },
  {
    bqName: "UnitCount",
    patterns: [new RegExp(`^unit_count${MP}#1\\.value$`)],
  },

  // ── Item Dimensions / Weight ──
  {
    bqName: "ItemWeight",
    patterns: [new RegExp(`^item_weight${MP}#1\\.value$`)],
  },
  {
    bqName: "ItemWeightUnit",
    patterns: [new RegExp(`^item_weight${MP}#1\\.unit$`)],
  },
  {
    bqName: "ItemHeight",
    patterns: [new RegExp(`^item_dimensions${MP}#1\\.height\\.value$`)],
  },
  {
    bqName: "ItemHeightUnit",
    patterns: [new RegExp(`^item_dimensions${MP}#1\\.height\\.unit$`)],
  },
  {
    bqName: "ItemLength",
    patterns: [new RegExp(`^item_dimensions${MP}#1\\.length\\.value$`)],
  },
  {
    bqName: "ItemLengthUnit",
    patterns: [new RegExp(`^item_dimensions${MP}#1\\.length\\.unit$`)],
  },
  {
    bqName: "ItemWidth",
    patterns: [new RegExp(`^item_dimensions${MP}#1\\.width\\.value$`)],
  },
  {
    bqName: "ItemWidthUnit",
    patterns: [new RegExp(`^item_dimensions${MP}#1\\.width\\.unit$`)],
  },

  // ── Package Dimensions / Weight ──
  {
    bqName: "PackageWeight",
    patterns: [new RegExp(`^item_package_weight${MP}#1\\.value$`)],
  },
  {
    bqName: "PackageWeightUnit",
    patterns: [new RegExp(`^item_package_weight${MP}#1\\.unit$`)],
  },
  {
    bqName: "PackageHeight",
    patterns: [
      new RegExp(`^item_package_dimensions${MP}#1\\.height\\.value$`),
    ],
  },
  {
    bqName: "PackageHeightUnit",
    patterns: [new RegExp(`^item_package_dimensions${MP}#1\\.height\\.unit$`)],
  },
  {
    bqName: "PackageLength",
    patterns: [
      new RegExp(`^item_package_dimensions${MP}#1\\.length\\.value$`),
    ],
  },
  {
    bqName: "PackageLengthUnit",
    patterns: [new RegExp(`^item_package_dimensions${MP}#1\\.length\\.unit$`)],
  },
  {
    bqName: "PackageWidth",
    patterns: [new RegExp(`^item_package_dimensions${MP}#1\\.width\\.value$`)],
  },
  {
    bqName: "PackageWidthUnit",
    patterns: [new RegExp(`^item_package_dimensions${MP}#1\\.width\\.unit$`)],
  },

  // ── Misc ──
  {
    bqName: "BatteriesRequired",
    patterns: [new RegExp(`^batteries_required${MP}#1\\.value$`)],
  },
  {
    bqName: "BatteriesIncluded",
    patterns: [new RegExp(`^batteries_included${MP}#1\\.value$`)],
  },
  {
    bqName: "ConditionType",
    patterns: [new RegExp(`^condition_type${MP}#1\\.value$`)],
  },
  {
    bqName: "MerchantShippingGroup",
    patterns: [new RegExp(`^merchant_shipping_group${MP}#1\\.value$`)],
  },
  {
    bqName: "FulfillmentChannel",
    patterns: [/^fulfillment_availability#1\.fulfillment_channel_code$/],
  },
];

function key(template: string, mp = US, lang = "en_US"): string {
  return template.replace("{MP}", mp).replace("{LANG}", lang);
}

describe("clrAttributesToBqRow", () => {
  describe("Product Identity", () => {
    it("maps contribution_sku → SKU", () => {
      const out = clrAttributesToBqRow(
        {
          "contribution_sku#1.value": "YOGATOWEL",
        },
        FIXTURE_ALIASES
      );
      expect(out.SKU).toBe("YOGATOWEL");
    });

    it("maps amzn1.volt.<region>.product_id_value → ProductId for any region", () => {
      expect(
        clrAttributesToBqRow(
          {
            "amzn1.volt.ca.product_id_value": "810178863723",
          },
          FIXTURE_ALIASES
        ).ProductId
      ).toBe("810178863723");
      expect(
        clrAttributesToBqRow(
          {
            "amzn1.volt.us.product_id_value": "810178863724",
          },
          FIXTURE_ALIASES
        ).ProductId
      ).toBe("810178863724");
    });

    it("maps amzn1.volt.<region>.product_id_type → ProductIdType", () => {
      expect(
        clrAttributesToBqRow(
          {
            "amzn1.volt.ca.product_id_type": "UPC",
          },
          FIXTURE_ALIASES
        ).ProductIdType
      ).toBe("UPC");
    });

    it("maps parentage_level → ParentageLevel", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("parentage_level[marketplace_id={MP}]#1.value")]: "Parent",
          },
          FIXTURE_ALIASES
        ).ParentageLevel
      ).toBe("Parent");
    });

    it("maps child_parent_sku_relationship.parent_sku → ParentSKU", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key(
              "child_parent_sku_relationship[marketplace_id={MP}]#1.parent_sku"
            )]: "PARENT-SKU-1",
          },
          FIXTURE_ALIASES
        ).ParentSKU
      ).toBe("PARENT-SKU-1");
    });

    it("maps variation_theme.name → VariationThemeName", () => {
      expect(
        clrAttributesToBqRow(
          {
            "variation_theme#1.name": "SIZE/COLOR",
          },
          FIXTURE_ALIASES
        ).VariationThemeName
      ).toBe("SIZE/COLOR");
    });
  });

  describe("Brand & Title", () => {
    it("resolves item_name for US marketplace", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key(
              "item_name[marketplace_id={MP}][language_tag={LANG}]#1.value"
            )]: "Cool Hat",
          },
          FIXTURE_ALIASES
        ).ItemName
      ).toBe("Cool Hat");
    });

    it("resolves item_name for CA marketplace via wildcard", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key(
              "item_name[marketplace_id={MP}][language_tag={LANG}]#1.value",
              CA,
              "en_CA"
            )]: "Toque rouge",
          },
          FIXTURE_ALIASES
        ).ItemName
      ).toBe("Toque rouge");
    });

    it("maps brand → BrandName", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("brand[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "MISSION",
          },
          FIXTURE_ALIASES
        ).BrandName
      ).toBe("MISSION");
    });

    it("maps product_type → ProductType", () => {
      expect(
        clrAttributesToBqRow(
          {
            "product_type#1.value": "UNDERPANTS",
          },
          FIXTURE_ALIASES
        ).ProductType
      ).toBe("UNDERPANTS");
    });
  });

  describe("Manufacturer & Model", () => {
    it("maps manufacturer → Manufacturer", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key(
              "manufacturer[marketplace_id={MP}][language_tag={LANG}]#1.value"
            )]: "Mission Athlete Care",
          },
          FIXTURE_ALIASES
        ).Manufacturer
      ).toBe("Mission Athlete Care");
    });

    it("maps part_number → PartNumber", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("part_number[marketplace_id={MP}]#1.value")]: "111392P",
          },
          FIXTURE_ALIASES
        ).PartNumber
      ).toBe("111392P");
    });

    it("maps model_number → ModelNumber", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("model_number[marketplace_id={MP}]#1.value")]: "Womens Baseball Cap",
          },
          FIXTURE_ALIASES
        ).ModelNumber
      ).toBe("Womens Baseball Cap");
    });
  });

  describe("Pricing", () => {
    it("maps list_price → ListPrice", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("list_price[marketplace_id={MP}]#1.value")]: "9.99",
          },
          FIXTURE_ALIASES
        ).ListPrice
      ).toBe("9.99");
    });

    it("maps purchasable_offer.our_price → OurPrice", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key(
              "purchasable_offer[marketplace_id={MP}][audience=ALL]#1.our_price#1.schedule#1.value_with_tax"
            )]: "9.99",
          },
          FIXTURE_ALIASES
        ).OurPrice
      ).toBe("9.99");
    });
  });

  describe("Classification", () => {
    it("maps item_type_keyword → ItemTypeKeyword", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("item_type_keyword[marketplace_id={MP}]#1.value")]: "Sports",
          },
          FIXTURE_ALIASES
        ).ItemTypeKeyword
      ).toBe("Sports");
    });

    it("joins generic_keyword #1..#3 → GenericKeywords", () => {
      const KW = "generic_keyword[marketplace_id={MP}][language_tag={LANG}]";
      const out = clrAttributesToBqRow(
        {
          [key(`${KW}#1.value`)]: "running",
          [key(`${KW}#3.value`)]: "sneaker",
          [key(`${KW}#2.value`)]: "athletic",
        },
        FIXTURE_ALIASES
      );
      expect(out.GenericKeywords).toBe("running, athletic, sneaker");
    });

    it("returns single-element GenericKeywords without trailing comma", () => {
      const out = clrAttributesToBqRow(
        {
          [key(
            "generic_keyword[marketplace_id={MP}][language_tag={LANG}]#1.value"
          )]: "running",
        },
        FIXTURE_ALIASES
      );
      expect(out.GenericKeywords).toBe("running");
    });
  });

  describe("Images", () => {
    it("maps main_product_image_locator → MainImageURL", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key(
              "main_product_image_locator[marketplace_id={MP}]#1.media_location"
            )]: "https://m.media-amazon.com/images/I/91y5kvMzAsL.jpg",
          },
          FIXTURE_ALIASES
        ).MainImageURL
      ).toBe("https://m.media-amazon.com/images/I/91y5kvMzAsL.jpg");
    });

    it("maps other_product_image_locator_N → OtherImageURLN for N=1..8", () => {
      const out = clrAttributesToBqRow(
        {
          [key(
            "other_product_image_locator_1[marketplace_id={MP}]#1.media_location"
          )]: "https://img.example.com/1.jpg",
          [key(
            "other_product_image_locator_5[marketplace_id={MP}]#1.media_location"
          )]: "https://img.example.com/5.jpg",
        },
        FIXTURE_ALIASES
      );
      expect(out.OtherImageURL1).toBe("https://img.example.com/1.jpg");
      expect(out.OtherImageURL5).toBe("https://img.example.com/5.jpg");
    });
  });

  describe("Bullet points", () => {
    it("splits bullet_point #1..#5 into BulletPoint1..BulletPoint5", () => {
      const BP = "bullet_point[marketplace_id={MP}][language_tag={LANG}]";
      const out = clrAttributesToBqRow(
        {
          [key(`${BP}#1.value`)]: "First bullet",
          [key(`${BP}#2.value`)]: "Second bullet",
          [key(`${BP}#5.value`)]: "Fifth bullet",
        },
        FIXTURE_ALIASES
      );
      expect(out.BulletPoint1).toBe("First bullet");
      expect(out.BulletPoint2).toBe("Second bullet");
      expect(out.BulletPoint5).toBe("Fifth bullet");
      expect(out.BulletPoint3).toBeUndefined();
    });
  });

  describe("Description", () => {
    it("maps product_description → ProductDescription", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key(
              "product_description[marketplace_id={MP}][language_tag={LANG}]#1.value"
            )]: "Long description here.",
          },
          FIXTURE_ALIASES
        ).ProductDescription
      ).toBe("Long description here.");
    });
  });

  describe("Product Attributes", () => {
    it("maps color → Color", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("color[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "White Multi",
          },
          FIXTURE_ALIASES
        ).Color
      ).toBe("White Multi");
    });

    it("maps size → Size", () => {
      expect(
        clrAttributesToBqRow(
          {
            [key("size[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "Standard",
          },
          FIXTURE_ALIASES
        ).Size
      ).toBe("Standard");
    });

    it("maps material, style, pattern, country_of_origin", () => {
      const out = clrAttributesToBqRow(
        {
          [key("material[marketplace_id={MP}][language_tag={LANG}]#1.value")]:
            "Polyester, Nylon",
          [key("style[marketplace_id={MP}][language_tag={LANG}]#1.value")]:
            "Wide Brim Hat",
          [key("pattern[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "Striped",
          [key("country_of_origin[marketplace_id={MP}]#1.value")]: "China",
        },
        FIXTURE_ALIASES
      );
      expect(out.Material).toBe("Polyester, Nylon");
      expect(out.Style).toBe("Wide Brim Hat");
      expect(out.Pattern).toBe("Striped");
      expect(out.CountryOfOrigin).toBe("China");
    });
  });

  describe("Dimensions & Weight", () => {
    it("maps item_dimensions height/length/width with units", () => {
      const D = "item_dimensions[marketplace_id={MP}]#1";
      const out = clrAttributesToBqRow(
        {
          [key(`${D}.height.value`)]: "5.5",
          [key(`${D}.height.unit`)]: "Inches",
          [key(`${D}.length.value`)]: "8.0",
          [key(`${D}.length.unit`)]: "Inches",
          [key(`${D}.width.value`)]: "8.0",
          [key(`${D}.width.unit`)]: "Inches",
        },
        FIXTURE_ALIASES
      );
      expect(out.ItemHeight).toBe("5.5");
      expect(out.ItemHeightUnit).toBe("Inches");
      expect(out.ItemLength).toBe("8.0");
      expect(out.ItemWidth).toBe("8.0");
      expect(out.ItemLengthUnit).toBe("Inches");
    });

    it("maps item_package_dimensions/weight", () => {
      const out = clrAttributesToBqRow(
        {
          [key("item_package_weight[marketplace_id={MP}]#1.value")]: "4.0",
          [key("item_package_weight[marketplace_id={MP}]#1.unit")]: "Pounds",
          [key(
            "item_package_dimensions[marketplace_id={MP}]#1.height.value"
          )]: "9.5",
        },
        FIXTURE_ALIASES
      );
      expect(out.PackageWeight).toBe("4.0");
      expect(out.PackageWeightUnit).toBe("Pounds");
      expect(out.PackageHeight).toBe("9.5");
    });
  });

  describe("Pass-through and edge cases", () => {
    it("passes through bqName-format keys not consumed by aliases", () => {
      const out = clrAttributesToBqRow(
        {
          Color: "Red",
          SummarizedTitle: "White|S/M",
        },
        FIXTURE_ALIASES
      );
      expect(out.Color).toBe("Red");
      expect(out.SummarizedTitle).toBe("White|S/M");
    });

    it("alias output takes priority over bqName-format pass-through with same key", () => {
      const out = clrAttributesToBqRow(
        {
          [key("color[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "Blue",
          Color: "Red",
        },
        FIXTURE_ALIASES
      );
      expect(out.Color).toBe("Blue");
    });

    it("ignores empty values", () => {
      const out = clrAttributesToBqRow(
        {
          [key("brand[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "",
          "contribution_sku#1.value": "  ",
          Color: "",
        },
        FIXTURE_ALIASES
      );
      expect(out.BrandName).toBeUndefined();
      expect(out.SKU).toBeUndefined();
      expect(out.Color).toBeUndefined();
    });

    it("trims whitespace from values", () => {
      const out = clrAttributesToBqRow(
        {
          "contribution_sku#1.value": "  YOGATOWEL  ",
        },
        FIXTURE_ALIASES
      );
      expect(out.SKU).toBe("YOGATOWEL");
    });

    it("drops CLR-format key values with no alias (left only in rawColumnValues by caller)", () => {
      const out = clrAttributesToBqRow(
        {
          [key(
            "obscure_field[marketplace_id={MP}][language_tag={LANG}]#1.value"
          )]: "Some value",
        },
        FIXTURE_ALIASES
      );
      // The obscure_field value is dropped; only Marketplace is derived from
      // the bracket. No other keys leak through.
      expect(out["obscure_field[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value"]).toBeUndefined();
      expect(out.Marketplace).toBe("US");
      expect(Object.keys(out)).toEqual(["Marketplace"]);
    });

    it("does not pass through CLR-format keys masquerading as bqNames", () => {
      // Real CLR keys have brackets/dots/hashes; bqNames are pure alphanumeric.
      const out = clrAttributesToBqRow(
        {
          "::listing_status": "Active", // leading ::, drop unless aliased
        },
        FIXTURE_ALIASES
      );
      // Status alias is defined for ::listing_status, so this maps:
      expect(out.Status).toBe("Active");
    });

    it("first match wins for multi-region product_id (current locale priority)", () => {
      // If a CLR row had both us and ca product_id values, first iterated wins.
      // We don't make ordering guarantees beyond stability of Object.keys insertion order.
      const out = clrAttributesToBqRow(
        {
          "amzn1.volt.us.product_id_value": "111",
          "amzn1.volt.ca.product_id_value": "222",
        },
        FIXTURE_ALIASES
      );
      expect(out.ProductId).toBe("111");
    });
  });

  describe("Marketplace derivation", () => {
    it("derives Marketplace=US from ATVPDKIKX0DER brackets", () => {
      const out = clrAttributesToBqRow(
        {
          [key("item_name[marketplace_id={MP}][language_tag={LANG}]#1.value")]:
            "Example",
          [key("brand[marketplace_id={MP}][language_tag={LANG}]#1.value")]:
            "MISSION",
        },
        FIXTURE_ALIASES
      );
      expect(out.Marketplace).toBe("US");
    });

    it("derives Marketplace=CA from A2EUQ1WTGCTBG2 brackets", () => {
      const out = clrAttributesToBqRow(
        {
          [key(
            "item_name[marketplace_id={MP}][language_tag={LANG}]#1.value",
            CA
          )]: "Example",
        },
        FIXTURE_ALIASES
      );
      expect(out.Marketplace).toBe("CA");
    });

    it("picks the most frequent marketplace_id when keys mix marketplaces", () => {
      const out = clrAttributesToBqRow(
        {
          // 3 US-bracketed keys, 1 CA-bracketed → US wins
          [key("item_name[marketplace_id={MP}][language_tag={LANG}]#1.value")]:
            "Example",
          [key("brand[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "X",
          [key("color[marketplace_id={MP}][language_tag={LANG}]#1.value")]: "Red",
          [key(
            "item_name[marketplace_id={MP}][language_tag={LANG}]#1.value",
            CA
          )]: "ExampleCA",
        },
        FIXTURE_ALIASES
      );
      expect(out.Marketplace).toBe("US");
    });

    it("falls back to the raw marketplace_id when not in the label table", () => {
      const out = clrAttributesToBqRow(
        {
          "item_name[marketplace_id=ZZZUNKNOWN][language_tag=en_US]#1.value": "X",
        },
        FIXTURE_ALIASES
      );
      expect(out.Marketplace).toBe("ZZZUNKNOWN");
    });

    it("omits Marketplace when no [marketplace_id=…] bracket appears", () => {
      const out = clrAttributesToBqRow(
        {
          "contribution_sku#1.value": "SKU-1",
          "product_type#1.value": "ARM_SLEEVE",
        },
        FIXTURE_ALIASES
      );
      expect(out.Marketplace).toBeUndefined();
    });

    it("does not overwrite a Marketplace bqName passed through directly", () => {
      const out = clrAttributesToBqRow(
        {
          Marketplace: "MX",
          [key("item_name[marketplace_id={MP}][language_tag={LANG}]#1.value")]:
            "Example", // would otherwise derive US
        },
        FIXTURE_ALIASES
      );
      expect(out.Marketplace).toBe("MX");
    });
  });
});
