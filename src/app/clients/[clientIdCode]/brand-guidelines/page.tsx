/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { redirect } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  aac,
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  clientBrandGuidelineNotes,
  driveFiles,
  variations,
  variationGroups,
} from "@/lib/db/schema";

function parseRawData(raw: unknown): Record<string, string> {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return {};
}
import BrandGuidelinesPage from "@/components/clients/brand-guidelines-page";
import { BrandGuidelinesMeta } from "./page-meta";

export const metadata = { title: "Brand Guidelines | 1o8 Hub" };

export default async function Page({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  const { clientIdCode } = await params;

  const [aacRow] = await db.select({ clientName: aac.clientName, rawData: aac.rawData })
    .from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1);
  const aacRaw = parseRawData(aacRow?.rawData);
  const brandName = aacRaw["BrandName"] || aacRow?.clientName || null;
  const brandUrl  = aacRaw["BrandURL"]  || null;

  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode)).limit(1);
  const versions = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.clientIdCode, clientIdCode))
    .orderBy(desc(clientBrandGuidelineVersions.versionNumber));
  const activeVersion = versions.find((v) => v.archivedAt === null) ?? null;
  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));
  const logoFiles = bg
    ? await db.select().from(driveFiles)
        .where(and(eq(driveFiles.entityType, "brand_logo"), eq(driveFiles.entityId, bg.id)))
    : [];

  const clientVariations = await db
    .select({
      id: variations.id,
      name: variations.name,
      code: variations.code,
      status: variations.status,
      contentGuidelines: variations.contentGuidelines,
    })
    .from(variations)
    .where(eq(variations.clientId, clientIdCode));

  const variationGuidelinesData = await Promise.all(
    clientVariations.map(async (v) => {
      const groups = await db
        .select({ id: variationGroups.id, name: variationGroups.name, contentGuidelines: variationGroups.contentGuidelines })
        .from(variationGroups)
        .where(eq(variationGroups.variationId, v.id))
        .orderBy(asc(variationGroups.sortOrder));
      return { ...v, groups };
    })
  );

  return (
    <>
      <BrandGuidelinesMeta />
      <BrandGuidelinesPage
        clientIdCode={clientIdCode}
        role={session.user.role}
        currentUserEmail={session.user.email!}
        brandName={brandName}
        brandUrl={brandUrl}
        initialState={{
          bg: bg ?? null,
          activeVersion,
          versions,
          notes,
          logoFiles,
          variationGuidelines: variationGuidelinesData,
        }}
      />
    </>
  );
}
