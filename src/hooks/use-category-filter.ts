"use client";

import { useMemo } from "react";

export type ValidValuesResult = {
  visible: boolean;
  options: string[] | null;
  isFreeText: boolean;
};

/** Fields that must stay free-text even when Amazon category picklists exist. */
const FREE_TEXT_WITH_OPTIONS_FIELDS = new Set(["Flavor"]);

export function allowsFreeTextWithOptions(bqName: string | null | undefined): boolean {
  return !!bqName && FREE_TEXT_WITH_OPTIONS_FIELDS.has(bqName);
}

function parseOptions(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Union of every option in a valid-values JSON, across all product types. */
export function collectAllValidValueOptions(
  validValues: string | null | undefined
): string[] {
  if (!validValues || validValues === "null" || validValues.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(validValues) as Record<string, unknown>;
    const seen = new Set<string>();
    for (const raw of Object.values(parsed)) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      for (const opt of parseOptions(raw)) {
        seen.add(opt);
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  } catch {
    return validValues
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }
}

export function mergeSuggestionOptions(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const opt of list) {
      const trimmed = opt.trim();
      if (trimmed) seen.add(trimmed);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function parseValidValues(
  validValues: string | null | undefined,
  productType: string | null | undefined
): ValidValuesResult {
  if (!validValues || validValues === "null" || validValues.trim() === "") {
    return { visible: true, options: null, isFreeText: true };
  }

  try {
    const parsed = JSON.parse(validValues);
    const keys = Object.keys(parsed);

    if (keys.includes("ALL")) {
      const allValue = parsed["ALL"];
      if (!allValue || allValue.trim() === "") {
        return { visible: true, options: null, isFreeText: true };
      }
      return { visible: true, options: parseOptions(allValue), isFreeText: false };
    }

    let matchedValue: string | null = null;

    for (const key of keys) {
      const keyParts = key.split(",").map((k) => k.trim());
      if (productType && keyParts.includes(productType)) {
        matchedValue = parsed[key];
        break;
      }
    }

    if (matchedValue === null || matchedValue === undefined) {
      return { visible: false, options: null, isFreeText: false };
    }

    if (!matchedValue || matchedValue.trim() === "") {
      return { visible: true, options: null, isFreeText: true };
    }

    return { visible: true, options: parseOptions(matchedValue), isFreeText: false };
  } catch {
    const options = validValues.split("|").map((s) => s.trim()).filter(Boolean);
    return { visible: true, options, isFreeText: false };
  }
}

export function useValidValues(validValues: string | null | undefined, productType: string | null | undefined) {
  return useMemo(() => parseValidValues(validValues, productType), [validValues, productType]);
}