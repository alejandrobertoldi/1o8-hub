import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientBrandVoice } from "@/lib/db/schema";
import { brandVoiceSchema, EMPTY_BRAND_VOICE, type BrandVoice } from "./types";

export type BrandVoiceRecord = {
  voice: BrandVoice;
  source: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getBrandVoice(clientIdCode: string): Promise<BrandVoiceRecord> {
  const [row] = await db.select().from(clientBrandVoice).where(eq(clientBrandVoice.clientIdCode, clientIdCode)).limit(1);
  if (!row) return { voice: EMPTY_BRAND_VOICE, source: null, updatedAt: null, updatedBy: null };
  const { id: _id, clientIdCode: _c, source, updatedBy, createdAt: _cr, updatedAt, ...fields } = row;
  // safeParse so a row written by an older shape still renders (bad fields fall back to defaults).
  const parsed = brandVoiceSchema.safeParse(fields);
  return {
    voice: parsed.success ? parsed.data : { ...EMPTY_BRAND_VOICE, ...fields },
    source,
    updatedAt: updatedAt.toISOString(),
    updatedBy,
  };
}

export async function saveBrandVoice(
  clientIdCode: string,
  voice: BrandVoice,
  meta: { source: string; updatedBy: string | null },
): Promise<void> {
  const values = { ...voice, source: meta.source, updatedBy: meta.updatedBy, updatedAt: new Date() };
  await db
    .insert(clientBrandVoice)
    .values({ clientIdCode, ...values })
    .onConflictDoUpdate({ target: clientBrandVoice.clientIdCode, set: values });
}
