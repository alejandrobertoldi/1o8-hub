/**
 * Product completeness score calculation.
 *
 * Evaluates how many Required and Conditionally Required fields are populated
 * for the product's category type (master.productType) using categoryMeta.
 */
import { getProductFieldValue } from "./product-mapper";
import { getAttributeRequirement } from "./category-requirement";
import type { Product, ColumnAttribute } from "./db/schema";

export interface CompletenessBreakdown {
  filled: number;
  total: number;
}

export interface CompletenessScore {
  /** 0–100 percentage */
  score: number;
  /** Total required + conditionally required fields for this product's category */
  totalRequired: number;
  /** Number of required + cond. required fields that have a non-empty value */
  filledRequired: number;
  /** Breakdown by requirement level */
  breakdown: {
    required: CompletenessBreakdown;
    conditionallyRequired: CompletenessBreakdown;
    recommended: CompletenessBreakdown;
  };
  /** Missing required field labels */
  missingRequired: string[];
  /** Missing conditionally required field labels */
  missingConditionallyRequired: string[];
}

export function calculateCompleteness(
  product: Product,
  attributes: ColumnAttribute[],
): CompletenessScore {
  const required: CompletenessBreakdown = { filled: 0, total: 0 };
  const conditionallyRequired: CompletenessBreakdown = { filled: 0, total: 0 };
  const recommended: CompletenessBreakdown = { filled: 0, total: 0 };
  const missingRequired: string[] = [];
  const missingConditionallyRequired: string[] = [];

  for (const attr of attributes) {
    const level = getAttributeRequirement(attr, product.productType);

    if (!level || level === "Not Required" || level === "Optional") continue;

    const bqName = attr.bqLabel || attr.generalLabel;
    const value = getProductFieldValue(product, bqName);
    const isFilled =
      value !== null && value !== undefined && String(value).trim() !== "";

    if (level === "Required") {
      required.total++;
      if (isFilled) required.filled++;
      else missingRequired.push(attr.generalLabel);
    } else if (level === "Conditionally Required") {
      conditionallyRequired.total++;
      if (isFilled) conditionallyRequired.filled++;
      else missingConditionallyRequired.push(attr.generalLabel);
    } else if (level === "Recommended" || level === "Preferred") {
      recommended.total++;
      if (isFilled) recommended.filled++;
    }
  }

  const totalRequired = required.total + conditionallyRequired.total;
  const filledRequired = required.filled + conditionallyRequired.filled;
  const score =
    totalRequired > 0
      ? Math.round((filledRequired / totalRequired) * 100)
      : 100;

  return {
    score,
    totalRequired,
    filledRequired,
    breakdown: { required, conditionallyRequired, recommended },
    missingRequired,
    missingConditionallyRequired,
  };
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "#10b981"; // emerald-500
  if (score >= 70) return "#FAC800"; // brand yellow
  if (score >= 50) return "#f97316"; // orange-500
  return "#ef4444"; // red-500
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return "Ready";
  if (score >= 70) return "Good";
  if (score >= 50) return "Incomplete";
  return "Poor";
}

export function getScoreBucket(
  score: number
): "ready" | "good" | "incomplete" | "poor" {
  if (score >= 90) return "ready";
  if (score >= 70) return "good";
  if (score >= 50) return "incomplete";
  return "poor";
}
