// Amazon FBA Revenue Calculator — fee tables and calculation engine
// Source: Amazon FBA fee schedule (US marketplace)

// ── Product Categories (for referral fees) ──────────────────────────
export const PRODUCT_CATEGORIES = [
  "Amazon Device Accessories",
  "Amazon Explore",
  "Automotive and Powersports",
  "Baby Products",
  "Backpacks, Handbags, and Luggage",
  "Base Equipment Power Tools",
  "Beauty, Health and Personal Care",
  "Business, Industrial, and Scientific Supplies",
  "Clothing and Accessories",
  "Compact Appliances",
  "Computers",
  "Consumer Electronics",
  "Electronics Accessories",
  "Everything Else",
  "Eyewear",
  "Fine Art",
  "Footwear",
  "Full-Size Appliances",
  "Furniture",
  "Gift Cards",
  "Grocery and Gourmet",
  "Home and Kitchen",
  "Jewelry",
  "Lawn and Garden",
  "Lawn Mowers and Snow Throwers",
  "Mattresses",
  "Media - Books, DVD, Music, Software, Video",
  "Musical Instruments and AV Production",
  "Office Products",
  "Pet Products",
  "Pet Products - veterinary diets",
  "Sports and Outdoors",
  "Tires",
  "Tools and Home Improvement",
  "Toys and Games",
  "Video Game Consoles",
  "Video Games and Gaming Accessories",
  "Watches",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

// Referral fee tiers: [category, priceMin, priceMax, rate, minReferralFee, variableClosingFee]
const REFERRAL_FEE_TABLE: [string, number, number, number, number, number][] = [
  ["Amazon Device Accessories", 0, 999999, 0.45, 0.3, 0],
  ["Amazon Explore", 0, 999999, 0.3, 2, 0],
  ["Automotive and Powersports", 0, 999999, 0.12, 0.3, 0],
  ["Baby Products", 0, 10, 0.08, 0.3, 0],
  ["Baby Products", 10, 999999, 0.15, 0.3, 0],
  ["Backpacks, Handbags, and Luggage", 0, 999999, 0.15, 0.3, 0],
  ["Base Equipment Power Tools", 0, 999999, 0.12, 0.3, 0],
  ["Beauty, Health and Personal Care", 0, 10, 0.08, 0.3, 0],
  ["Beauty, Health and Personal Care", 10, 999999, 0.15, 0.3, 0],
  ["Business, Industrial, and Scientific Supplies", 0, 999999, 0.12, 0.3, 0],
  ["Clothing and Accessories", 0, 15, 0.05, 0.3, 0],
  ["Clothing and Accessories", 15, 20, 0.1, 0.3, 0],
  ["Clothing and Accessories", 20, 999999, 0.17, 0.3, 0],
  ["Compact Appliances", 0, 300, 0.15, 0.3, 0],
  ["Compact Appliances", 300, 999999, 0.08, 0.3, 0],
  ["Computers", 0, 999999, 0.08, 0.3, 0],
  ["Consumer Electronics", 0, 999999, 0.08, 0.3, 0],
  ["Electronics Accessories", 0, 100, 0.15, 0.3, 0],
  ["Electronics Accessories", 100, 999999, 0.08, 0.3, 0],
  ["Everything Else", 0, 999999, 0.15, 0.3, 0],
  ["Eyewear", 0, 999999, 0.15, 0.3, 0],
  ["Fine Art", 0, 100, 0.2, 0, 0],
  ["Fine Art", 100, 1000, 0.15, 0, 0],
  ["Fine Art", 1000, 5000, 0.1, 0, 0],
  ["Fine Art", 5000, 999999, 0.05, 0, 0],
  ["Footwear", 0, 999999, 0.15, 0.3, 0],
  ["Full-Size Appliances", 0, 999999, 0.08, 0.3, 0],
  ["Furniture", 0, 200, 0.15, 0.3, 0],
  ["Furniture", 200, 999999, 0.1, 0.3, 0],
  ["Gift Cards", 0, 999999, 0.2, 0, 0],
  ["Grocery and Gourmet", 0, 15, 0.08, 0, 0],
  ["Grocery and Gourmet", 15, 999999, 0.15, 0, 0],
  ["Home and Kitchen", 0, 999999, 0.15, 0.3, 0],
  ["Jewelry", 0, 250, 0.2, 0.3, 0],
  ["Jewelry", 250, 999999, 0.05, 0.3, 0],
  ["Lawn and Garden", 0, 999999, 0.15, 0.3, 0],
  ["Lawn Mowers and Snow Throwers", 0, 500, 0.15, 0.3, 0],
  ["Lawn Mowers and Snow Throwers", 500, 999999, 0.08, 0.3, 0],
  ["Mattresses", 0, 999999, 0.15, 0.3, 0],
  ["Media - Books, DVD, Music, Software, Video", 0, 999999, 0.15, 0, 1.8],
  ["Musical Instruments and AV Production", 0, 999999, 0.15, 0.3, 0],
  ["Office Products", 0, 999999, 0.15, 0.3, 0],
  ["Pet Products", 0, 999999, 0.15, 0.3, 0],
  ["Pet Products - veterinary diets", 0, 999999, 0.22, 0.3, 0],
  ["Sports and Outdoors", 0, 999999, 0.15, 0.3, 0],
  ["Tires", 0, 999999, 0.1, 0.3, 0],
  ["Tools and Home Improvement", 0, 999999, 0.15, 0.3, 0],
  ["Toys and Games", 0, 999999, 0.15, 0.3, 0],
  ["Video Game Consoles", 0, 999999, 0.08, 0, 1.8],
  ["Video Games and Gaming Accessories", 0, 999999, 0.15, 0, 1.8],
  ["Watches", 0, 1500, 0.16, 0.3, 0],
  ["Watches", 1500, 999999, 0.03, 0.3, 0],
];

// ── Size Tier Definitions ───────────────────────────────────────────
export type SizeTier =
  | "Small standard-size"
  | "Large standard-size"
  | "Large Bulky"
  | "Extra Large 0-50 lb"
  | "Extra Large 50+-70 lb"
  | "Extra Large 70+-150 lb"
  | "Extra Large 150+ lb";

interface SizeTierRule {
  tier: SizeTier;
  swMaxOz: number;
  longestMax: number;
  medianMax: number;
  shortestMax: number;
  lgMax: number; // length + girth max (0 = no constraint)
  usesDimensionalWeight: boolean;
}

const SIZE_TIER_RULES: SizeTierRule[] = [
  { tier: "Small standard-size", swMaxOz: 16, longestMax: 15, medianMax: 12, shortestMax: 0.75, lgMax: 0, usesDimensionalWeight: false },
  { tier: "Large standard-size", swMaxOz: 320, longestMax: 18, medianMax: 14, shortestMax: 8, lgMax: 0, usesDimensionalWeight: true },
  { tier: "Large Bulky", swMaxOz: 800, longestMax: 59, medianMax: 33, shortestMax: 33, lgMax: 130, usesDimensionalWeight: true },
  { tier: "Extra Large 0-50 lb", swMaxOz: 800, longestMax: 999, medianMax: 999, shortestMax: 999, lgMax: 999, usesDimensionalWeight: true },
  { tier: "Extra Large 50+-70 lb", swMaxOz: 1120, longestMax: 999, medianMax: 999, shortestMax: 999, lgMax: 999, usesDimensionalWeight: true },
  { tier: "Extra Large 70+-150 lb", swMaxOz: 2400, longestMax: 999, medianMax: 999, shortestMax: 999, lgMax: 999, usesDimensionalWeight: true },
  { tier: "Extra Large 150+ lb", swMaxOz: 15984, longestMax: 999, medianMax: 999, shortestMax: 999, lgMax: 999, usesDimensionalWeight: false },
];

// FBA Fulfillment fee table: [sizeTier, swMinOz, swMaxOz, feeRegular, feeApparel, feeDG, aboveOz, extraRegular, extraApparel, extraDG]
const FBA_FULFILLMENT_TABLE: [string, number, number, number, number, number, number, number, number, number][] = [
  ["Small standard-size", 0, 2, 3.25, 3.5, 4.37, 0, 0, 0, 0],
  ["Small standard-size", 2, 4, 3.34, 3.5, 4.46, 0, 0, 0, 0],
  ["Small standard-size", 4, 6, 3.44, 3.67, 4.56, 0, 0, 0, 0],
  ["Small standard-size", 6, 8, 3.53, 3.67, 4.65, 0, 0, 0, 0],
  ["Small standard-size", 8, 10, 3.64, 3.99, 4.76, 0, 0, 0, 0],
  ["Small standard-size", 10, 12, 3.74, 3.99, 4.85, 0, 0, 0, 0],
  ["Small standard-size", 12, 14, 3.82, 4.27, 4.93, 0, 0, 0, 0],
  ["Small standard-size", 14, 16, 3.87, 4.27, 5.02, 0, 0, 0, 0],
  ["Large standard-size", 0, 4, 3.92, 4.56, 5.09, 0, 0, 0, 0],
  ["Large standard-size", 4, 8, 4.16, 4.77, 5.33, 0, 0, 0, 0],
  ["Large standard-size", 8, 12, 4.43, 5.0, 5.59, 0, 0, 0, 0],
  ["Large standard-size", 12, 16, 4.84, 5.46, 5.81, 0, 0, 0, 0],
  ["Large standard-size", 16, 20, 5.29, 6.27, 6.28, 0, 0, 0, 0],
  ["Large standard-size", 20, 24, 5.68, 6.27, 6.68, 0, 0, 0, 0],
  ["Large standard-size", 24, 28, 5.84, 6.53, 6.85, 0, 0, 0, 0],
  ["Large standard-size", 28, 32, 6.1, 6.53, 7.01, 0, 0, 0, 0],
  ["Large standard-size", 32, 36, 6.24, 7.04, 7.1, 0, 0, 0, 0],
  ["Large standard-size", 36, 40, 6.44, 7.04, 7.3, 0, 0, 0, 0],
  ["Large standard-size", 40, 44, 6.61, 7.27, 7.47, 0, 0, 0, 0],
  ["Large standard-size", 44, 48, 7.03, 7.27, 7.89, 0, 0, 0, 0],
  // 2026 non-peak rates (Jan 15 – Oct 14, 2026) for $10-$50 items
  ["Large standard-size", 48, 320, 6.97, 7.59, 8.28, 48, 0.08, 0.16, 0.08],
  ["Large Bulky", 0, 800, 9.61, 11.89, 11.89, 16, 0.38, 0.38, 0.38],
  ["Extra Large 0-50 lb", 0, 800, 26.33, 32.48, 32.48, 16, 0.38, 0.38, 0.38],
  ["Extra Large 50+-70 lb", 800, 1120, 40.12, 47.43, 47.43, 816, 0.75, 0.75, 0.75],
  ["Extra Large 70+-150 lb", 1120, 2400, 54.35, 68.3, 68.3, 1136, 0.75, 0.75, 0.75],
  ["Extra Large 150+ lb", 2400, 15984, 194.55, 231.61, 231.61, 2416, 0.19, 0.19, 0.19],
];

// Service add-ons
export const SERVICE_ADDONS = [
  { id: "opaque_bagging", label: "Opaque bagging", cost: 1.0 },
  { id: "tape", label: "Tape", cost: 0.6 },
  { id: "label", label: "Label", cost: 0.55 },
  { id: "bagging", label: "Bagging", cost: 0.7 },
  { id: "bubble_wrap", label: "Bubble wrap", cost: 1.04 },
] as const;

// Storage fee table: [pst, surMinWeeks, surMaxWeeks, baseFee, surcharge, totalFee, peakPeriod, productType]
const STORAGE_FEE_TABLE: [string, number, number, number, number, number, string, string][] = [
  ["standard", 0, 22, 0.78, 0, 0.78, "JAN-SEP", "Non-Dangerous goods"],
  ["standard", 22, 28, 0.78, 0.44, 1.22, "JAN-SEP", "Non-Dangerous goods"],
  ["standard", 28, 36, 0.78, 0.76, 1.54, "JAN-SEP", "Non-Dangerous goods"],
  ["standard", 36, 44, 0.78, 1.16, 1.94, "JAN-SEP", "Non-Dangerous goods"],
  ["standard", 44, 52, 0.78, 1.58, 2.36, "JAN-SEP", "Non-Dangerous goods"],
  ["standard", 52, 999, 0.78, 1.88, 2.66, "JAN-SEP", "Non-Dangerous goods"],
  ["oversize", 0, 22, 0.56, 0, 0.56, "JAN-SEP", "Non-Dangerous goods"],
  ["oversize", 22, 28, 0.56, 0.23, 0.79, "JAN-SEP", "Non-Dangerous goods"],
  ["oversize", 28, 36, 0.56, 0.46, 1.02, "JAN-SEP", "Non-Dangerous goods"],
  ["oversize", 36, 44, 0.56, 0.63, 1.19, "JAN-SEP", "Non-Dangerous goods"],
  ["oversize", 44, 52, 0.56, 0.76, 1.32, "JAN-SEP", "Non-Dangerous goods"],
  ["oversize", 52, 999, 0.56, 1.26, 1.82, "JAN-SEP", "Non-Dangerous goods"],
  ["standard", 0, 22, 2.4, 0, 2.4, "OCT-DEC", "Non-Dangerous goods"],
  ["standard", 22, 28, 2.4, 0.44, 2.84, "OCT-DEC", "Non-Dangerous goods"],
  ["standard", 28, 36, 2.4, 0.76, 3.16, "OCT-DEC", "Non-Dangerous goods"],
  ["standard", 36, 44, 2.4, 1.16, 3.56, "OCT-DEC", "Non-Dangerous goods"],
  ["standard", 44, 52, 2.4, 1.58, 3.98, "OCT-DEC", "Non-Dangerous goods"],
  ["standard", 52, 999, 2.4, 1.88, 4.28, "OCT-DEC", "Non-Dangerous goods"],
  ["oversize", 0, 22, 1.4, 0, 1.4, "OCT-DEC", "Non-Dangerous goods"],
  ["oversize", 22, 28, 1.4, 0.23, 1.63, "OCT-DEC", "Non-Dangerous goods"],
  ["oversize", 28, 36, 1.4, 0.46, 1.86, "OCT-DEC", "Non-Dangerous goods"],
  ["oversize", 36, 44, 1.4, 0.63, 2.03, "OCT-DEC", "Non-Dangerous goods"],
  ["oversize", 44, 52, 1.4, 0.76, 2.16, "OCT-DEC", "Non-Dangerous goods"],
  ["oversize", 52, 999, 1.4, 1.26, 2.66, "OCT-DEC", "Non-Dangerous goods"],
];

// Flat DG storage rates (no utilization surcharge)
const DG_STORAGE_RATES: Record<string, Record<string, number>> = {
  "JAN-SEP": { standard: 0.99, oversize: 0.78 },
  "OCT-DEC": { standard: 3.63, oversize: 2.43 },
};

// Inbound placement fees — 2026 rates (Jan 15, 2026+)
// [sizeTier, weightMinOz, weightMaxOz, location, eastFee, centralFee, westFee]
// Exact per-region rates from Amazon Revenue Calculator
const INBOUND_FEE_TABLE: [string, number, number, string, number, number, number][] = [
  // ── Standard-size (Minimal shipment splits = Single location) ──
  // Small standard: 2 weight bands
  ["Small standard-size", 0, 8, "Single", 0.14, 0.23, 0.32],    // 8 oz or less
  ["Small standard-size", 8, 16, "Single", 0.16, 0.24, 0.32],   // 8+ to 16 oz
  // Large standard: 8 weight bands
  ["Large standard-size", 0, 12, "Single", 0.20, 0.30, 0.40],   // 12 oz or less
  ["Large standard-size", 12, 24, "Single", 0.24, 0.37, 0.50],  // 12+ oz to 1.5 lb
  ["Large standard-size", 24, 48, "Single", 0.34, 0.47, 0.60],  // 1.5+ to 3 lb
  ["Large standard-size", 48, 80, "Single", 0.40, 0.55, 0.70],  // 3+ to 5 lb
  ["Large standard-size", 80, 112, "Single", 0.42, 0.69, 0.98], // 5+ to 7 lb
  ["Large standard-size", 112, 160, "Single", 0.44, 0.81, 1.20],// 7+ to 10 lb
  ["Large standard-size", 160, 240, "Single", 0.46, 0.97, 1.50],// 10+ to 15 lb
  ["Large standard-size", 240, 320, "Single", 0.55, 1.23, 1.90],// 15+ to 20 lb

  // ── Bulky (Minimal shipment splits = Single) ──
  ["Large Bulky", 0, 80, "Single", 1.10, 1.35, 1.60],    // 5 lb or less
  ["Large Bulky", 80, 192, "Single", 1.75, 2.08, 2.40],  // 5+ to 12 lb
  ["Large Bulky", 192, 448, "Single", 2.74, 3.12, 3.50],  // 12+ to 28 lb
  ["Large Bulky", 448, 672, "Single", 3.95, 4.45, 4.95],  // 28+ to 42 lb
  ["Large Bulky", 672, 800, "Single", 4.80, 5.38, 5.95],  // 42+ to 50 lb

  // ── Bulky (Partial shipment splits = Two-Three locations) ──
  ["Large Bulky", 0, 80, "Two-Three", 0.55, 0.83, 1.10],
  ["Large Bulky", 80, 192, "Two-Three", 0.65, 1.20, 1.75],
  ["Large Bulky", 192, 448, "Two-Three", 0.81, 1.50, 2.19],
  ["Large Bulky", 448, 672, "Two-Three", 1.05, 1.94, 2.83],
  ["Large Bulky", 672, 800, "Two-Three", 1.23, 2.28, 3.32],
  // Note: Extra-Large products are exempt from inbound placement fees per Amazon policy
];

// Removal and disposal fees — 2026 rates
// Flat per-unit fee by size tier (applies to both removal and disposal orders)
const REMOVAL_DISPOSAL_RATES: Record<string, { removal: number; disposal: number }> = {
  "Small standard-size": { removal: 1.04, disposal: 1.04 },
  "Large standard-size": { removal: 5.01, disposal: 5.01 },
  "Large Bulky": { removal: 9.44, disposal: 9.44 },
  "Extra Large 0-50 lb": { removal: 9.44, disposal: 9.44 },
  "Extra Large 50+-70 lb": { removal: 9.44, disposal: 9.44 },
  "Extra Large 70+-150 lb": { removal: 9.44, disposal: 9.44 },
  "Extra Large 150+ lb": { removal: 9.44, disposal: 9.44 },
};

// ── Calculation Engine ──────────────────────────────────────────────

export interface CalculatorInputs {
  category: ProductCategory;
  isApparel: boolean;
  isDangerousGoods: boolean;
  sellingPlan: "Professional" | "Individual";
  itemPrice: number;
  shippingCharge: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
  selectedAddons: string[];
  peakPeriod: "JAN-SEP" | "OCT-DEC";
  storageUtilizationWeeks: number;
  avgInventoryUnits: number;
  estimatedMonthlySold: number;
  unitsToInbound: number;
  inboundPlacement: "Minimal Shipment Splits" | "Partial Shipment Splits" | "Amazon Optimized Splits";
  inboundRegion: "West" | "Central" | "East";
  removalUnits: number;
  disposalUnits: number;
  miscCost: number;
  cogs: number;
  promotionsCost: number;
  feeDiscounts: number;
  taxesOnFees: number;
}

export interface CalculatorResult {
  // Dimensions
  dimensionalWeightLb: number;
  shippingWeightLb: number;
  shippingWeightOz: number;
  sizeTier: SizeTier;
  sortedDims: { longest: number; median: number; shortest: number };
  lengthPlusGirth: number;

  // FBA breakdown
  fba: {
    salesPrice: number;
    referralFee: number;
    referralFeeRate: number;
    fixedClosingFee: number;
    variableClosingFee: number;
    digitalServicesFee: number;
    totalAmazonFees: number;
    fbaFulfillmentFee: number;
    serviceAddonsCost: number;
    totalFulfillmentCost: number;
    monthlyStorageCostPerUnit: number;
    storageCostPerUnitSold: number;
    totalStorageCost: number;
    inboundFeePerUnit: number;
    totalInboundFee: number;
    inboundShippingPerUnit: number;
    removalFeePerUnit: number;
    disposalFeePerUnit: number;
    totalRemovalDisposalFee: number;
    removalDisposalCostPerUnitSold: number;
    totalOtherCosts: number;
    costPerUnit: number;
    netProfit: number;
    netMargin: number;
  };

  // Merchant breakdown
  merchant: {
    salesPrice: number;
    referralFee: number;
    fixedClosingFee: number;
    variableClosingFee: number;
    digitalServicesFee: number;
    totalAmazonFees: number;
  };

  subscriptionFee: number;
}

export function calculate(inputs: CalculatorInputs): CalculatorResult {
  const { lengthIn, widthIn, heightIn, weightLb } = inputs;

  // Sort dimensions
  const dims = [lengthIn, widthIn, heightIn].sort((a, b) => b - a);
  const [longest, median, shortest] = dims;
  const lengthPlusGirth = longest + 2 * (median + shortest);
  const unitWeightOz = weightLb * 16;
  const dimensionalWeightOz = (lengthIn * widthIn * heightIn) / 139 * 16;
  const dimensionalWeightLb = dimensionalWeightOz / 16;

  // Determine size tier
  const sizeTier = determineSizeTier(longest, median, shortest, unitWeightOz, dimensionalWeightOz, lengthPlusGirth);

  // Shipping weight depends on tier
  const useDW = sizeTier !== "Small standard-size" && sizeTier !== "Extra Large 150+ lb";
  const shippingWeightOz = useDW ? Math.max(unitWeightOz, dimensionalWeightOz) : unitWeightOz;
  // Amazon rounds shipping weight up to nearest 0.25 lb (4 oz)
  const swOzRounded = Math.ceil(shippingWeightOz / 4) * 4;
  const shippingWeightLb = swOzRounded / 16;

  // Referral fee
  const { rate, minFee, variableClosingFee } = getReferralFeeInfo(inputs.category, inputs.itemPrice);
  const referralFeeCalc = inputs.itemPrice * rate;
  const referralFee = Math.max(referralFeeCalc, minFee);
  const fixedClosingFee = inputs.sellingPlan === "Individual" ? 0.99 : 0;

  const totalAmazonFees = referralFee + fixedClosingFee + variableClosingFee;

  // FBA Fulfillment fee
  const fbaFulfillmentFee = getFBAFulfillmentFee(sizeTier, swOzRounded, inputs.isApparel, inputs.isDangerousGoods);

  // Service add-ons
  const serviceAddonsCost = inputs.selectedAddons.reduce((sum, id) => {
    const addon = SERVICE_ADDONS.find((a) => a.id === id);
    return sum + (addon?.cost ?? 0);
  }, 0);

  const totalFulfillmentCost = fbaFulfillmentFee + serviceAddonsCost;

  // Storage cost
  const storageSizePST = sizeTier.includes("standard") ? "standard" : "oversize";
  // Amazon rounds volume to 3 decimal places
  const volumeCuFt = Math.round(((lengthIn * widthIn * heightIn) / 1728) * 1000) / 1000;
  const monthlyStorageCostPerUnit = getMonthlyStorageCost(
    storageSizePST,
    inputs.peakPeriod,
    inputs.storageUtilizationWeeks,
    inputs.isDangerousGoods,
    volumeCuFt
  );
  const storageCostPerUnitSold =
    inputs.estimatedMonthlySold > 0
      ? (monthlyStorageCostPerUnit * inputs.avgInventoryUnits) / inputs.estimatedMonthlySold
      : 0;

  // Inbound fee
  const locationMap = {
    "Minimal Shipment Splits": "Single",
    "Partial Shipment Splits": "Two-Three",
    "Amazon Optimized Splits": "Four+",
  } as const;
  const locationType = locationMap[inputs.inboundPlacement];
  const inboundFeePerUnit =
    locationType === "Four+"
      ? 0
      : getInboundFee(sizeTier, swOzRounded, locationType, inputs.inboundRegion);
  const totalInboundFee = inboundFeePerUnit * inputs.unitsToInbound;
  const inboundPerUnitSold = inputs.estimatedMonthlySold > 0
    ? totalInboundFee / (inputs.estimatedMonthlySold > 0 ? inputs.unitsToInbound : 1)
    : inboundFeePerUnit;

  // Removal and disposal
  const removalDisposalRates = REMOVAL_DISPOSAL_RATES[sizeTier] ?? { removal: 0, disposal: 0 };
  const removalFeePerUnit = removalDisposalRates.removal;
  const disposalFeePerUnit = removalDisposalRates.disposal;
  const totalRemovalDisposalFee = (removalFeePerUnit * inputs.removalUnits) + (disposalFeePerUnit * inputs.disposalUnits);
  const removalDisposalCostPerUnitSold = inputs.estimatedMonthlySold > 0
    ? totalRemovalDisposalFee / inputs.estimatedMonthlySold
    : 0;

  // Other costs
  const totalOtherCosts = inputs.miscCost + inputs.cogs - inputs.feeDiscounts + inputs.taxesOnFees;

  // Net calculation
  const costPerUnit = totalAmazonFees + totalFulfillmentCost + storageCostPerUnitSold + inboundPerUnitSold + inputs.promotionsCost + removalDisposalCostPerUnitSold + totalOtherCosts;
  const netProfit = inputs.itemPrice - costPerUnit;
  const netMargin = inputs.itemPrice > 0 ? netProfit / inputs.itemPrice : 0;

  // Subscription fee
  const subscriptionFee = inputs.sellingPlan === "Professional" ? 39.99 : 0;

  // Merchant fulfillment (only Amazon fees, no FBA costs)
  const merchantSalesPrice = inputs.itemPrice + inputs.shippingCharge;
  const merchantReferralCalc = merchantSalesPrice * rate;
  const merchantReferralFee = Math.max(merchantReferralCalc, minFee);

  return {
    dimensionalWeightLb,
    shippingWeightLb,
    shippingWeightOz: swOzRounded,
    sizeTier,
    sortedDims: { longest, median, shortest },
    lengthPlusGirth,
    fba: {
      salesPrice: inputs.itemPrice,
      referralFee,
      referralFeeRate: rate,
      fixedClosingFee,
      variableClosingFee,
      digitalServicesFee: 0,
      totalAmazonFees,
      fbaFulfillmentFee,
      serviceAddonsCost,
      totalFulfillmentCost,
      monthlyStorageCostPerUnit,
      storageCostPerUnitSold,
      totalStorageCost: storageCostPerUnitSold,
      inboundFeePerUnit: inboundPerUnitSold,
      totalInboundFee,
      inboundShippingPerUnit: 0,
      removalFeePerUnit,
      disposalFeePerUnit,
      totalRemovalDisposalFee,
      removalDisposalCostPerUnitSold,
      totalOtherCosts,
      costPerUnit,
      netProfit,
      netMargin,
    },
    merchant: {
      salesPrice: merchantSalesPrice,
      referralFee: merchantReferralFee,
      fixedClosingFee,
      variableClosingFee,
      digitalServicesFee: 0,
      totalAmazonFees: merchantReferralFee + fixedClosingFee + variableClosingFee,
    },
    subscriptionFee,
  };
}

// ── Lookup helpers ──────────────────────────────────────────────────

function determineSizeTier(
  longest: number,
  median: number,
  shortest: number,
  unitWeightOz: number,
  dimensionalWeightOz: number,
  lengthPlusGirth: number
): SizeTier {
  // Check small standard first
  if (unitWeightOz <= 16 && longest <= 15 && median <= 12 && shortest <= 0.75) {
    return "Small standard-size";
  }
  // Large standard: use max(uw, dw) for weight check
  const lsWeight = Math.max(unitWeightOz, dimensionalWeightOz);
  if (lsWeight <= 320 && longest <= 18 && median <= 14 && shortest <= 8) {
    return "Large standard-size";
  }
  // Large Bulky
  const lbWeight = Math.max(unitWeightOz, dimensionalWeightOz);
  if (lbWeight <= 800 && longest <= 59 && median <= 33 && shortest <= 33 && lengthPlusGirth <= 130) {
    return "Large Bulky";
  }
  // Extra Large tiers by weight
  const xlWeight = Math.max(unitWeightOz, dimensionalWeightOz);
  const xlWeightLb = xlWeight / 16;
  if (xlWeightLb <= 50) return "Extra Large 0-50 lb";
  if (xlWeightLb <= 70) return "Extra Large 50+-70 lb";
  if (xlWeightLb <= 150) return "Extra Large 70+-150 lb";
  return "Extra Large 150+ lb";
}

function getReferralFeeInfo(category: string, price: number) {
  const match = REFERRAL_FEE_TABLE.find(
    ([cat, pMin, pMax]) => cat === category && price >= pMin && price < pMax
  );
  if (!match) {
    return { rate: 0.15, minFee: 0.3, variableClosingFee: 0 };
  }
  return { rate: match[3], minFee: match[4], variableClosingFee: match[5] };
}

function getFBAFulfillmentFee(
  sizeTier: SizeTier,
  shippingWeightOz: number,
  isApparel: boolean,
  isDG: boolean
): number {
  const match = FBA_FULFILLMENT_TABLE.find(
    ([tier, swMin, swMax]) => tier === sizeTier && shippingWeightOz > swMin && shippingWeightOz <= swMax
  );
  // Fallback: get last row for the tier
  const row = match ?? FBA_FULFILLMENT_TABLE.filter(([t]) => t === sizeTier).pop();
  if (!row) return 0;

  const [, , , feeReg, feeApp, feeDG, aboveOz, extraReg, extraApp, extraDG] = row;
  const baseFee = isDG ? feeDG : isApparel ? feeApp : feeReg;

  if (aboveOz > 0 && shippingWeightOz > aboveOz) {
    const extraOz = shippingWeightOz - aboveOz;
    // Surcharge is per 4oz increment for standard, per 1lb (16oz) for oversize
    const isStandard = sizeTier.includes("standard");
    const extraRate = isDG ? extraDG : isApparel ? extraApp : extraReg;
    if (isStandard) {
      return baseFee + extraRate * Math.ceil(extraOz / 4);
    }
    return baseFee + extraRate * Math.ceil(extraOz / 16);
  }

  return baseFee;
}

function getMonthlyStorageCost(
  pst: string,
  peakPeriod: string,
  utilizationWeeks: number,
  isDG: boolean,
  volumeCuFt: number
): number {
  if (isDG) {
    const rate = DG_STORAGE_RATES[peakPeriod]?.[pst] ?? 0;
    return rate * volumeCuFt;
  }

  const match = STORAGE_FEE_TABLE.find(
    ([p, surMin, surMax, , , , peak, type]) =>
      p === pst &&
      peak === peakPeriod &&
      type === "Non-Dangerous goods" &&
      utilizationWeeks >= surMin &&
      utilizationWeeks < surMax
  );

  const rate = match ? match[5] : 0;
  return rate * volumeCuFt;
}

function getInboundFee(
  sizeTier: SizeTier,
  shippingWeightOz: number,
  locationType: "Single" | "Two-Three",
  region: "West" | "Central" | "East"
): number {
  const match = INBOUND_FEE_TABLE.find(
    ([tier, wMin, wMax, loc]) =>
      tier === sizeTier &&
      shippingWeightOz > wMin &&
      shippingWeightOz <= wMax &&
      loc === locationType
  );

  if (!match) {
    const fallback = INBOUND_FEE_TABLE.filter(
      ([tier, , , loc]) => tier === sizeTier && loc === locationType
    ).pop();
    if (!fallback) return 0;
    const [, , , , east, central, west] = fallback;
    return pickRegion(east, central, west, region);
  }

  const [, , , , east, central, west] = match;
  return pickRegion(east, central, west, region);
}

function pickRegion(east: number, central: number, west: number, region: "West" | "Central" | "East"): number {
  if (region === "East") return east;
  if (region === "Central") return central;
  return west;
}
