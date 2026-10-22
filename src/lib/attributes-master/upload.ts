/**
 * Wires CLR uploads into attributes_master + the two new junction tables.
 *
 * First-wins canonical: attributes_master rows are NEVER mutated here.
 * On miss we INSERT; on match we record provenance with NULL diff cols
 * when client values equal canonical, or populated client_* cols when
 * they differ.
 *
 * See docs/superpowers/specs/2026-05-26-attributes-category-first-design.md.
 */
import { db } from "@/lib/db";
import {
  attributesMaster,
  attributeCategoryIndex,
  attributeClientProvenance,
} from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import type { ParsedCategoryReport } from "@/lib/category-report-parser";
import {
  canonicalScalarForProductType,
  canonicalValidValuesForProductType,
  isProductTypeExplicitlyKeyed,
  mergeCanonicalScalar,
  mergeCanonicalArray,
} from "./canonical-value";

export interface UpsertAttributesMasterArgs {
  uploadId: number;
  clientIdCode: string;
  parsedReports: ParsedCategoryReport[];
}

export interface UpsertAttributesMasterResult {
  canonicalInserted: number;
  canonicalMatched: number;
  provenanceWritten: number;
  divergencesDetected: number;
}

// JSON-array equality helper. Order-insensitive on string arrays so that
// ["red","blue"] === ["blue","red"]. Returns true if both nullish.
function arraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return a?.length === 0 && !b ? true : b?.length === 0 && !a ? true : false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export async function upsertAttributesMasterFromReports(
  args: UpsertAttributesMasterArgs
): Promise<UpsertAttributesMasterResult> {
  const { uploadId, clientIdCode, parsedReports } = args;
  if (parsedReports.length === 0) {
    return {
      canonicalInserted: 0,
      canonicalMatched: 0,
      provenanceWritten: 0,
      divergencesDetected: 0,
    };
  }

  // 1. Load ALL existing canonical rows once, keyed by lowercased hub label.
  //    Small table (~1k rows) → cheap full scan.
  const existing = await db
    .select({
      uuid: attributesMaster.uuid,
      attributesHubLabel: attributesMaster.attributesHubLabel,
      attributesRequirement: attributesMaster.attributesRequirement,
      attributesDescription: attributesMaster.attributesDescription,
      attributesValidValues: attributesMaster.attributesValidValues,
    })
    .from(attributesMaster);

  const canonicalByLabel = new Map<
    string,
    {
      uuid: string;
      attributesHubLabel: string | null;
      attributesRequirement: string | null;
      attributesDescription: string | null;
      attributesValidValues: string | null;
    }
  >();
  for (const row of existing) {
    if (row.attributesHubLabel) {
      canonicalByLabel.set(row.attributesHubLabel.toLowerCase(), row);
    }
  }

  let canonicalInserted = 0;
  let canonicalMatched = 0;
  let provenanceWritten = 0;
  let divergencesDetected = 0;

  const WRITE_CHUNK = 200;

  type CanonicalInsert = {
    uuid: string;
    attributesHubLabel: string;
    attributesClrLabel: string;
    attributesRequirement: string | null;
    attributesDescription: string | null;
    attributesValidValues: string | null;
    attibutesSource: string;
  };
  const pendingCanonicalInserts: CanonicalInsert[] = [];
  const indexRows: {
    productType: string;
    marketplaceId: string;
    attributeUuid: string;
    firstSeenClientIdCode: string;
  }[] = [];
  const indexSeen = new Set<string>();
  const provenanceRows: {
    attributeUuid: string;
    clientIdCode: string;
    productType: string;
    marketplaceId: string;
    sourceUploadId: number;
    clientRequirement: string | null;
    clientValidValues: string[] | null;
    clientDescription: string | null;
  }[] = [];
  const canonicalUpdates = new Map<string, Record<string, string>>();

  for (const report of parsedReports) {
    const { productType, marketplace, attributes: reportAttrs } = report;

    for (const attr of reportAttrs) {
      const hubLabel = attr.amazonFieldName;
      if (!hubLabel) continue;
      const key = hubLabel.toLowerCase();
      let canonical = canonicalByLabel.get(key);

      if (!canonical) {
        const validValuesJson =
          attr.validValues.length > 0
            ? JSON.stringify({ [productType]: attr.validValues })
            : null;
        const uuid = crypto.randomUUID();
        pendingCanonicalInserts.push({
          uuid,
          attributesHubLabel: hubLabel,
          attributesClrLabel: `[marketplace_id=${marketplace}] ${attr.localLabel}`,
          attributesRequirement: attr.requirement || null,
          attributesDescription: attr.description || null,
          attributesValidValues: validValuesJson,
          attibutesSource: `CLR upload ${uploadId}`,
        });
        canonical = {
          uuid,
          attributesHubLabel: hubLabel,
          attributesRequirement: attr.requirement || null,
          attributesDescription: attr.description || null,
          attributesValidValues: validValuesJson,
        };
        canonicalByLabel.set(key, canonical);
        canonicalInserted += 1;
      } else {
        canonicalMatched += 1;
      }

      const indexKey = `${productType}\0${marketplace}\0${canonical.uuid}`;
      if (!indexSeen.has(indexKey)) {
        indexSeen.add(indexKey);
        indexRows.push({
          productType,
          marketplaceId: marketplace,
          attributeUuid: canonical.uuid,
          firstSeenClientIdCode: clientIdCode,
        });
      }

      const canonicalRequirementForPT = canonicalScalarForProductType(
        canonical.attributesRequirement,
        productType
      );
      const canonicalDescriptionForPT = canonicalScalarForProductType(
        canonical.attributesDescription,
        productType
      );
      const canonicalValidValuesForPT = canonicalValidValuesForProductType(
        canonical.attributesValidValues,
        productType
      );

      const clientReq = attr.requirement || null;
      const clientDesc = attr.description || null;
      const clientVV = attr.validValues.length > 0 ? attr.validValues : null;

      const reqExplicit = isProductTypeExplicitlyKeyed(
        canonical.attributesRequirement,
        productType
      );
      const descExplicit = isProductTypeExplicitlyKeyed(
        canonical.attributesDescription,
        productType
      );
      const vvExplicit = isProductTypeExplicitlyKeyed(
        canonical.attributesValidValues,
        productType
      );

      let writeReq: string | null = null;
      let writeDesc: string | null = null;
      let writeVV: string | null = null;
      let clientRequirement: string | null = null;
      let clientDescription: string | null = null;
      let clientValidValues: string[] | null = null;

      if (clientReq !== null && clientReq !== canonicalRequirementForPT) {
        if (reqExplicit) clientRequirement = clientReq;
        else writeReq = mergeCanonicalScalar(canonical.attributesRequirement, productType, clientReq);
      }
      if (clientDesc !== null && clientDesc !== canonicalDescriptionForPT) {
        if (descExplicit) clientDescription = clientDesc;
        else writeDesc = mergeCanonicalScalar(canonical.attributesDescription, productType, clientDesc);
      }
      if (clientVV !== null && !arraysEqual(clientVV, canonicalValidValuesForPT)) {
        if (vvExplicit) clientValidValues = clientVV;
        else writeVV = mergeCanonicalArray(canonical.attributesValidValues, productType, clientVV);
      }

      if (writeReq !== null || writeDesc !== null || writeVV !== null) {
        const prev = canonicalUpdates.get(canonical.uuid) ?? {};
        const setVals: Record<string, string> = { ...prev };
        if (writeReq !== null) setVals.attributesRequirement = writeReq;
        if (writeDesc !== null) setVals.attributesDescription = writeDesc;
        if (writeVV !== null) setVals.attributesValidValues = writeVV;
        canonicalUpdates.set(canonical.uuid, setVals);
        if (writeReq !== null) canonical.attributesRequirement = writeReq;
        if (writeDesc !== null) canonical.attributesDescription = writeDesc;
        if (writeVV !== null) canonical.attributesValidValues = writeVV;
      }

      const hasDivergence =
        clientRequirement !== null ||
        clientDescription !== null ||
        clientValidValues !== null;

      provenanceRows.push({
        attributeUuid: canonical.uuid,
        clientIdCode,
        productType,
        marketplaceId: marketplace,
        sourceUploadId: uploadId,
        clientRequirement,
        clientValidValues,
        clientDescription,
      });

      provenanceWritten += 1;
      if (hasDivergence) divergencesDetected += 1;
    }
  }

  for (let i = 0; i < pendingCanonicalInserts.length; i += WRITE_CHUNK) {
    await db
      .insert(attributesMaster)
      .values(pendingCanonicalInserts.slice(i, i + WRITE_CHUNK));
  }
  for (let i = 0; i < indexRows.length; i += WRITE_CHUNK) {
    await db
      .insert(attributeCategoryIndex)
      .values(indexRows.slice(i, i + WRITE_CHUNK))
      .onConflictDoNothing();
  }
  await Promise.all(
    [...canonicalUpdates.entries()].map(([uuid, setVals]) =>
      db
        .update(attributesMaster)
        .set(setVals)
        .where(eq(attributesMaster.uuid, uuid))
    )
  );
  for (let i = 0; i < provenanceRows.length; i += WRITE_CHUNK) {
    await db
      .insert(attributeClientProvenance)
      .values(provenanceRows.slice(i, i + WRITE_CHUNK))
      .onConflictDoUpdate({
        target: [
          attributeClientProvenance.attributeUuid,
          attributeClientProvenance.clientIdCode,
          attributeClientProvenance.productType,
          attributeClientProvenance.marketplaceId,
        ],
        set: {
          sourceUploadId: sql`excluded.source_upload_id`,
          lastUploadedAt: sql`now()`,
          clientRequirement: sql`excluded.client_requirement`,
          clientValidValues: sql`excluded.client_valid_values`,
          clientDescription: sql`excluded.client_description`,
        },
      });
  }

  return {
    canonicalInserted,
    canonicalMatched,
    provenanceWritten,
    divergencesDetected,
  };
}
