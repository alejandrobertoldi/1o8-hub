// Uses the shared pool from db/index.ts. This module used to call postgres()
// itself, which created a SECOND pool with no `max` (so the driver default of
// 10) at module scope and no globalThis guard — so every hot reload in dev
// leaked another 10 connections against the same Supavisor tenant, starving
// every route in the process until the pooler reaped them minutes later.
import { sqlClient as client } from "@/lib/db";

export type AttributeMaster = {
  UUID: string;
  Attributes_HubLabel: string;
  Attributes_ReferenceGroup: string;
  Attributes_ReferenceSubgroup: string;
  Attributes_ClientSummaryCardName: string | null;
  Attributes_ClientSummaryCardOrder: string | null;
  Attributes_PDPCardName: string;
  Attributes_PDPSubcardName: string | null;
  Attributes_PDPCardOrder: number;
  Attributes_PDPSubcardOrder: number | null;
  Attributes_Description: string | null;
  Attributes_CLRLabel: string | null;
  Attributes_ALRLabel: string | null;
  Attributes_Requirement: string | null;
  Attibutes_source: string | null;
  Attributes_format: string | null;
  PG_Attributes_Type: string | null;
  BQ_Attributes_Type: string | null;
  Attributes_ValidValues: string | null;
  BQ_Master: string | null;
};

export type PDPCard = {
  name: string;
  order: number;
  subcards: PDPSubcard[];
};

export type PDPSubcard = {
  name: string;
  order: number;
  attributes: AttributeMaster[];
};

export async function fetchAttributesMaster(): Promise<AttributeMaster[]> {
  const rows = await client<AttributeMaster[]>`
    SELECT * FROM attributes_master ORDER BY "Attributes_PDPCardOrder", "Attributes_PDPSubcardOrder";
  `;
  return rows;
}

export function groupByPDPCard(attributes: AttributeMaster[]): PDPCard[] {
  const cardMap = new Map<string, PDPCard>();

  for (const attr of attributes) {
    const cardName = attr.Attributes_PDPCardName;
    if (!cardName) continue;

    let card = cardMap.get(cardName);
    if (!card) {
      card = {
        name: cardName,
        order: attr.Attributes_PDPCardOrder,
        subcards: [],
      };
      cardMap.set(cardName, card);
    }

    const subcardName = attr.Attributes_PDPSubcardName || "-";
    let subcard = card.subcards.find((s) => s.name === subcardName);
    if (!subcard) {
      subcard = {
        name: subcardName,
        order: attr.Attributes_PDPSubcardOrder ?? 0,
        attributes: [],
      };
      card.subcards.push(subcard);
    }

    subcard.attributes.push(attr);
  }

  cardMap.forEach((card) => {
    card.subcards.sort((a, b) => a.order - b.order);
  });

  return Array.from(cardMap.values()).sort((a, b) => a.order - b.order);
}

export function getRequirementCounts(attributes: AttributeMaster[]): {
  required: number;
  conditionallyRequired: number;
  recommended: number;
  optional: number;
} {
  const counts = {
    required: 0,
    conditionallyRequired: 0,
    recommended: 0,
    optional: 0,
  };

  for (const attr of attributes) {
    const req = attr.Attributes_Requirement;
    if (req === "Required") counts.required++;
    else if (req === "Conditionally Required") counts.conditionallyRequired++;
    else if (req === "Recommended") counts.recommended++;
    else if (req === "Optional") counts.optional++;
  }

  return counts;
}

export function parseValidValues(validValuesJson: string | null): string[] | null {
  if (!validValuesJson) return null;

  try {
    const parsed = JSON.parse(validValuesJson);
    const allValues = parsed.ALL;
    if (allValues && typeof allValues === "string") {
      return allValues.split(", ").map((v: string) => v.trim());
    }
    return null;
  } catch {
    return null;
  }
}

// closeAttributesMasterClient() was removed along with this module's private
// pool. It had zero callers, and against the shared client it would have closed
// the pool out from under every other route in the process.