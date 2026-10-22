import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac } from "@/lib/db/schema";
import { WebSocialPage } from "@/components/clients/web-social-page";
import { WEB_SOCIAL_FIELDS } from "@/lib/clients/web-social";

export const metadata = { title: "Website & Social | 1o8 Hub" };

function parseRawData(raw: unknown): Record<string, string> {
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return {}; } }
  if (raw && typeof raw === "object") return raw as Record<string, string>;
  return {};
}

export default async function Page({ params }: { params: Promise<{ clientIdCode: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  const { clientIdCode } = await params;
  const [row] = await db.select({ clientName: aac.clientName, rawData: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1);
  const raw = parseRawData(row?.rawData);
  return (
    <WebSocialPage
      clientIdCode={clientIdCode}
      clientName={row?.clientName ?? clientIdCode}
      initial={Object.fromEntries(WEB_SOCIAL_FIELDS.map((f) => [f.key, String(raw[f.key] ?? "").trim()]))}
      readOnly={session.user.role === "viewer"}
    />
  );
}
