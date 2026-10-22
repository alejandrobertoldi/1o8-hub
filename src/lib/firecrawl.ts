/**
 * Firecrawl integration for Amazon product scraping.
 * Uses Firecrawl's scrape API to extract structured data from Amazon product pages,
 * then maps the result to RainforestProduct shape for compatibility.
 */

import type { RainforestProduct } from "@/types/rainforest";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
      ogImage?: string;
      [key: string]: unknown;
    };
    extract?: Record<string, unknown>;
  };
  error?: string;
}

const AMAZON_PRODUCT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const },
    brand: { type: "string" as const },
    price: { type: "number" as const },
    price_raw: { type: "string" as const },
    availability: { type: "string" as const },
    rating: { type: "number" as const },
    ratings_total: { type: "number" as const },
    feature_bullets: { type: "array" as const, items: { type: "string" as const } },
    main_image_url: { type: "string" as const },
    images_count: { type: "number" as const },
    categories: { type: "array" as const, items: { type: "string" as const } },
    bestseller_rank_1: { type: "string" as const },
    bestseller_category_1: { type: "string" as const },
    bestseller_rank_2: { type: "string" as const },
    bestseller_category_2: { type: "string" as const },
    is_prime: { type: "boolean" as const },
    manufacturer: { type: "string" as const },
    dimensions: { type: "string" as const },
    weight: { type: "string" as const },
    date_first_available: { type: "string" as const },
    parent_asin: { type: "string" as const },
    has_a_plus_content: { type: "boolean" as const },
    has_brand_story: { type: "boolean" as const },
    recent_sales: { type: "string" as const },
    variant_asins: { type: "array" as const, items: { type: "string" as const } },
    ingredients: { type: "array" as const, items: { type: "string" as const } },
    subscribe_and_save_discount: { type: "string" as const },
    unit_price: { type: "string" as const },
  },
};

/**
 * Scrape an Amazon product page via Firecrawl and return a RainforestProduct-compatible object.
 */
export async function scrapeAmazonProduct(
  asin: string,
  amazonDomain: string = "amazon.com"
): Promise<{ product: RainforestProduct; creditsUsed: number }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }

  const productUrl = `https://www.${amazonDomain}/dp/${asin}`;

  const response = await fetch(FIRECRAWL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: productUrl,
      formats: ["extract"],
      extract: {
        schema: AMAZON_PRODUCT_SCHEMA,
        prompt: "Extract Amazon product listing data including title, brand, price, bullets, images, ratings, BSR, availability, dimensions, and variant information.",
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`Firecrawl API returned ${response.status}: ${errText}`);
  }

  const result: FirecrawlScrapeResponse = await response.json();

  if (!result.success || !result.data?.extract) {
    throw new Error(result.error || "Firecrawl extraction failed");
  }

  const ext = result.data.extract;

  // Map Firecrawl extracted data to RainforestProduct shape
  const product: RainforestProduct = {
    asin,
    title: str(ext.title),
    brand: str(ext.brand),
    parent_asin: str(ext.parent_asin) ?? undefined,
    manufacturer: str(ext.manufacturer) ?? undefined,
    main_image: ext.main_image_url ? { link: String(ext.main_image_url) } : undefined,
    images_count: num(ext.images_count),
    feature_bullets: Array.isArray(ext.feature_bullets)
      ? ext.feature_bullets.map(String)
      : undefined,
    feature_bullets_count: Array.isArray(ext.feature_bullets)
      ? ext.feature_bullets.length
      : undefined,
    rating: num(ext.rating),
    ratings_total: num(ext.ratings_total),
    dimensions: str(ext.dimensions) ?? undefined,
    weight: str(ext.weight) ?? undefined,
    first_available: ext.date_first_available
      ? { raw: String(ext.date_first_available), utc: "" }
      : undefined,
    categories_flat: Array.isArray(ext.categories)
      ? ext.categories.join(" > ")
      : str(ext.categories) ?? undefined,
    bestsellers_rank: buildBsrArray(ext),
    buybox_winner: buildBuybox(ext),
    a_plus_content: {
      has_a_plus_content: ext.has_a_plus_content === true,
      has_brand_story: ext.has_brand_story === true,
    },
    recent_sales: str(ext.recent_sales) ?? undefined,
    variants: Array.isArray(ext.variant_asins)
      ? ext.variant_asins.map((a: unknown) => ({
          asin: String(a),
          title: "",
          is_current_product: String(a) === asin,
          link: `https://www.${amazonDomain}/dp/${a}`,
        }))
      : undefined,
    ingredients: Array.isArray(ext.ingredients)
      ? ext.ingredients.map(String)
      : undefined,
  };

  return { product, creditsUsed: 1 };
}

function str(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  return String(v);
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function buildBsrArray(
  ext: Record<string, unknown>
): { rank: number; category: string; link: string }[] | undefined {
  const ranks: { rank: number; category: string; link: string }[] = [];

  const rank1 = parseInt(String(ext.bestseller_rank_1 ?? "").replace(/[#,]/g, ""));
  if (!isNaN(rank1) && ext.bestseller_category_1) {
    ranks.push({ rank: rank1, category: String(ext.bestseller_category_1), link: "" });
  }

  const rank2 = parseInt(String(ext.bestseller_rank_2 ?? "").replace(/[#,]/g, ""));
  if (!isNaN(rank2) && ext.bestseller_category_2) {
    ranks.push({ rank: rank2, category: String(ext.bestseller_category_2), link: "" });
  }

  return ranks.length > 0 ? ranks : undefined;
}

function buildBuybox(ext: Record<string, unknown>) {
  const price = num(ext.price);
  if (price == null) return undefined;

  return {
    price: {
      symbol: "$",
      value: price,
      currency: "USD",
      raw: str(ext.price_raw) ?? `$${price.toFixed(2)}`,
    },
    unit_price: ext.unit_price
      ? { symbol: "$", value: 0, currency: "USD", raw: String(ext.unit_price) }
      : undefined,
    availability: {
      type: ext.availability ? "string" : "unknown",
      raw: str(ext.availability) ?? "",
    },
    fulfillment: {
      type: "",
      is_fulfilled_by_amazon: false,
      is_sold_by_amazon: false,
      is_fulfilled_by_third_party: false,
      is_sold_by_third_party: false,
    },
    is_prime: ext.is_prime === true,
    subscribe_and_save: ext.subscribe_and_save_discount
      ? { base_discount_percentage: 0, base_price: { symbol: "$", value: 0, currency: "USD", raw: "" } }
      : undefined,
  };
}
