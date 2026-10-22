import { describe, it, expect } from "vitest";
import { clrRowToMasterFields } from "./clr-master-mapper";
import { getProductFieldValue } from "./product-mapper";
import type { ParsedClrRow } from "./clr-row-parser";
import type { Product } from "./db/schema";
import type { Alias } from "./onboarding/clr-attribute-aliases";

const US = "ATVPDKIKX0DER";
const CA = "A2EUQ1WTGCTBG2";

// Marketplace + language wildcard fragments used in regex literals below.
const MP = `\\[marketplace_id=[^\\]]+\\]`;
const LANG = `\\[language_tag=[^\\]]+\\]`;

// Fixture lifted verbatim from `src/lib/onboarding/clr-attribute-aliases.test.ts`
// (the canonical alias set). Duplicated rather than shared so the mapper test
// stays self-contained and mirrors what `loadClrAliases()` would produce at
// runtime from the attributes table.
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

const ITEM_NAME_US = `item_name[marketplace_id=${US}][language_tag=en_US]#1.value`;
const BRAND_US = `brand[marketplace_id=${US}][language_tag=en_US]#1.value`;
const LIST_PRICE_US = `list_price[marketplace_id=${US}]#1.value`;
const MAIN_IMAGE_US = `main_product_image_locator[marketplace_id=${US}]#1.media_location`;
const GENERIC_KW_US_1 = `generic_keyword[marketplace_id=${US}][language_tag=en_US]#1.value`;
const GENERIC_KW_US_2 = `generic_keyword[marketplace_id=${US}][language_tag=en_US]#2.value`;
const MANUFACTURER_US = `manufacturer[marketplace_id=${US}][language_tag=en_US]#1.value`;
const PARENT_SKU_US = `child_parent_sku_relationship[marketplace_id=${US}]#1.parent_sku`;
const ITEM_TYPE_KW_US = `item_type_keyword[marketplace_id=${US}]#1.value`;
const PARENTAGE_LEVEL_US = `parentage_level[marketplace_id=${US}]#1.value`;

const baseRow: ParsedClrRow = {
  sku: "SKU-1",
  productType: "SHOES",
  attributes: {
    "contribution_sku#1.value": "SKU-1",
    "product_type#1.value": "SHOES",
    [ITEM_NAME_US]: "Red running shoe",
    [BRAND_US]: "Acme",
    [LIST_PRICE_US]: "29.99",
    [MAIN_IMAGE_US]: "https://img.example.com/1.jpg",
    [GENERIC_KW_US_1]: "running",
    [MANUFACTURER_US]: "Acme Inc.",
    [PARENT_SKU_US]: "PARENT-1",
    [ITEM_TYPE_KW_US]: "Athletic Shoe",
    [PARENTAGE_LEVEL_US]: "Child",
    "amzn1.volt.us.product_id_value": "812345678901",
    "amzn1.volt.us.product_id_type": "UPC",
    "::listing_status": "Active",
    "color[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value": "Red",
    "size[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value": "10",
  },
  requiredComplete: true,
};

describe("clrRowToMasterFields", () => {
  describe("master core columns", () => {
    it("populates SKU, ItemName, BrandName, ListPrice, MainImageURL, ProductType, FeedProductType", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0123456789",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(p.sku).toBe("SKU-1");
      expect(p.itemName).toBe("Red running shoe");
      expect(p.brandName).toBe("Acme");
      expect(p.listPrice).toBe("29.99");
      expect(p.mainImageUrl).toBe("https://img.example.com/1.jpg");
      expect(p.productType).toBe("SHOES");
      expect(p.feedProductType).toBe("SHOES");
    });

    it("populates ItemTypeKeyword, ParentageLevel, ParentSKU, GenericKeywords", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0123456789",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(p.itemTypeKeyword).toBe("Athletic Shoe");
      expect(p.parentageLevel).toBe("Child");
      expect(p.parentSku).toBe("PARENT-1");
      expect(p.genericKeywords).toBe("running");
    });

    it("joins generic_keyword #1 + #2 with ', '", async () => {
      const row: ParsedClrRow = {
        ...baseRow,
        attributes: {
          ...baseRow.attributes,
          [GENERIC_KW_US_2]: "athletic",
        },
      };
      const p = await clrRowToMasterFields(
        row,
        { asin: "B0X", status: "Active" },
        FIXTURE_ALIASES
      );
      expect(p.genericKeywords).toBe("running, athletic");
    });

    it("ALR-sourced asin + status overrides CLR-side ::listing_status", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0FROMALR",
          status: "Inactive",
        },
        FIXTURE_ALIASES
      );
      expect(p.asin).toBe("B0FROMALR");
      expect(p.status).toBe("Inactive");
    });

    it("falls back to row.sku when alias miss (legacy CLR formats)", async () => {
      const p = await clrRowToMasterFields(
        {
          sku: "FALLBACK-SKU",
          productType: "BARE",
          attributes: {},
          requiredComplete: false,
        },
        { asin: null, status: null },
        FIXTURE_ALIASES
      );
      expect(p.sku).toBe("FALLBACK-SKU");
      expect(p.productType).toBe("BARE");
      expect(p.feedProductType).toBe("BARE");
    });

    it("does not set clientIdCode (caller's responsibility)", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0X",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(p.clientIdCode).toBeUndefined();
    });
  });

  describe("non-core fields land in JSONB blobs and are PDP-resolvable", () => {
    it("ProductId + ProductIdType are retrievable via getProductFieldValue", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0X",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      // Cast: getProductFieldValue accepts the inferred Product shape; NewProduct
      // is a structurally-compatible superset for read paths.
      const product = p as unknown as Product;
      expect(getProductFieldValue(product, "ProductId")).toBe("812345678901");
      expect(getProductFieldValue(product, "ProductIdType")).toBe("UPC");
    });

    it("Manufacturer is retrievable via getProductFieldValue", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0X",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(
        getProductFieldValue(p as unknown as Product, "Manufacturer")
      ).toBe("Acme Inc.");
    });

    it("Color and Size are retrievable via getProductFieldValue", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0X",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(getProductFieldValue(p as unknown as Product, "Color")).toBe("Red");
      expect(getProductFieldValue(p as unknown as Product, "Size")).toBe("10");
    });
  });

  describe("rawColumnValues preserves original CLR-format keys (zero-loss)", () => {
    it("retains every CLR field ID verbatim", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0X",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(p.rawColumnValues).toMatchObject({
        "contribution_sku#1.value": "SKU-1",
        [ITEM_NAME_US]: "Red running shoe",
        [BRAND_US]: "Acme",
        [MANUFACTURER_US]: "Acme Inc.",
        "amzn1.volt.us.product_id_value": "812345678901",
        "amzn1.volt.us.product_id_type": "UPC",
      });
    });

    it("does NOT pollute rawColumnValues with bqName-keyed values", async () => {
      const p = await clrRowToMasterFields(
        baseRow,
        {
          asin: "B0X",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(p.rawColumnValues).not.toHaveProperty("ProductId");
      expect(p.rawColumnValues).not.toHaveProperty("Manufacturer");
    });
  });

  describe("marketplace wildcard (CA)", () => {
    it("resolves item_name + brand for CA marketplace", async () => {
      const ITEM_CA = `item_name[marketplace_id=${CA}][language_tag=en_CA]#1.value`;
      const BRAND_CA = `brand[marketplace_id=${CA}][language_tag=en_CA]#1.value`;
      const row: ParsedClrRow = {
        sku: "SKU-CA-1",
        productType: "HATS",
        attributes: {
          "contribution_sku#1.value": "SKU-CA-1",
          "product_type#1.value": "HATS",
          [ITEM_CA]: "Toque rouge",
          [BRAND_CA]: "MapleCo",
        },
        requiredComplete: true,
      };
      const p = await clrRowToMasterFields(
        row,
        {
          asin: "B0CA1",
          status: "Active",
        },
        FIXTURE_ALIASES
      );
      expect(p.itemName).toBe("Toque rouge");
      expect(p.brandName).toBe("MapleCo");
    });
  });
});
