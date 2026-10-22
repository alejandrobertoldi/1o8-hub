import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { getBrandVoice } from "@/lib/brand-voice/queries";
import BrandVoicePage from "@/components/clients/brand-voice-page";
import { BrandVoiceMeta } from "./page-meta";

export const metadata = { title: "Brand Voice | 1o8 Hub" };

function parseRawData(raw: unknown): Record<string, string> {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return {};
}

export default async function Page({ params }: { params: Promise<{ clientIdCode: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  const { clientIdCode } = await params;

  const [[aacRow], record] = await Promise.all([
    db.select({ clientName: aac.clientName, rawData: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1),
    getBrandVoice(clientIdCode),
  ]);
  const raw = parseRawData(aacRow?.rawData);
  const role = session.user.role;

  return (
    <>
      <BrandVoiceMeta />
      <BrandVoicePage
        clientIdCode={clientIdCode}
        brandName={raw["BrandName"] || aacRow?.clientName || null}
        brandUrl={raw["BrandURL"] || null}
        initial={record}
        readOnly={!(role === "editor" || hasAdminPowers(role))}
      />
    </>
  );
}
