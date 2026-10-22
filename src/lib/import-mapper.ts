/**
 * Auto-mapping logic for matching source column headers (CSV or BigQuery)
 * against known column_attributes entries.
 */
import type { ColumnAttribute } from "./db/schema";

export interface ColumnMapping {
  sourceHeader: string;
  bqName: string | null;
  generalLabel: string | null;
  confidence: "exact" | "partial" | "unmapped";
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\s\-]/g, "");
}

export function autoMapColumns(
  sourceHeaders: string[],
  attributes: ColumnAttribute[]
): ColumnMapping[] {
  return sourceHeaders.map((header) => {
    const norm = normalize(header);

    // 1. Exact match on bqLabel
    const exactBq = attributes.find(
      (a) => a.bqLabel && normalize(a.bqLabel) === norm
    );
    if (exactBq) {
      return {
        sourceHeader: header,
        bqName: exactBq.bqLabel,
        generalLabel: exactBq.generalLabel,
        confidence: "exact" as const,
      };
    }

    // 2. Exact match on generalLabel
    const exactGeneral = attributes.find(
      (a) => normalize(a.generalLabel) === norm
    );
    if (exactGeneral) {
      return {
        sourceHeader: header,
        bqName: exactGeneral.bqLabel,
        generalLabel: exactGeneral.generalLabel,
        confidence: "exact" as const,
      };
    }

    // 3. Contains match (only if the normalized strings are >= 4 chars to avoid false positives)
    if (norm.length >= 4) {
      const partial = attributes.find((a) => {
        const normBq = a.bqLabel ? normalize(a.bqLabel) : "";
        const normGen = normalize(a.generalLabel);
        return (
          (normBq.length >= 4 && (normBq.includes(norm) || norm.includes(normBq))) ||
          (normGen.length >= 4 && (normGen.includes(norm) || norm.includes(normGen)))
        );
      });
      if (partial) {
        return {
          sourceHeader: header,
          bqName: partial.bqLabel,
          generalLabel: partial.generalLabel,
          confidence: "partial" as const,
        };
      }
    }

    // 4. No match
    return {
      sourceHeader: header,
      bqName: null,
      generalLabel: null,
      confidence: "unmapped" as const,
    };
  });
}
