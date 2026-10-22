/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandGuidelinesIndexMeta } from "./page-meta";
import { inArray } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientBrandGuidelines, clientBrandGuidelineVersions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

interface Row {
  clientIdCode: string;
  clientName: string | null;
  status: string;
  hasGuidelines: boolean;
  activeVersion: number | null;
  activeFilename: string | null;
  lastUpdated: Date | null;
}

export const metadata = { title: "Brand Guidelines | 1o8 Hub" };

export default async function Page() {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");

  const clients = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      status: aac.clientStatus,
    })
    .from(aac)
    .orderBy(aac.clientName);

  const bgRows = await db
    .select({
      clientIdCode: clientBrandGuidelines.clientIdCode,
      activeVersionId: clientBrandGuidelines.activeVersionId,
      updatedAt: clientBrandGuidelines.updatedAt,
    })
    .from(clientBrandGuidelines);

  const bgByClient = new Map(bgRows.map((r) => [r.clientIdCode, r]));
  const activeVersionIds = bgRows.map((r) => r.activeVersionId).filter((v): v is string => !!v);

  const versionRows = activeVersionIds.length
    ? await db
        .select({
          id: clientBrandGuidelineVersions.id,
          versionNumber: clientBrandGuidelineVersions.versionNumber,
          originalFilename: clientBrandGuidelineVersions.originalFilename,
        })
        .from(clientBrandGuidelineVersions)
        .where(inArray(clientBrandGuidelineVersions.id, activeVersionIds))
    : [];
  const versionsById = new Map(versionRows.map((v) => [v.id, v]));

  const rows: Row[] = clients
    .filter((c) => c.status === "Active")
    .map((c) => {
      const bg = bgByClient.get(c.clientIdCode);
      const activeVersion = bg?.activeVersionId ? versionsById.get(bg.activeVersionId) : undefined;
      return {
        clientIdCode: c.clientIdCode,
        clientName: c.clientName,
        status: c.status,
        hasGuidelines: !!bg,
        activeVersion: activeVersion?.versionNumber ?? null,
        activeFilename: activeVersion?.originalFilename ?? null,
        lastUpdated: bg?.updatedAt ?? null,
      };
    });

  const withCount = rows.filter((r) => r.hasGuidelines).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <BrandGuidelinesIndexMeta />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Brand Guidelines</h1>
        <p className="text-sm text-muted-foreground">
          {withCount} of {rows.length} active clients have a brand book uploaded.
        </p>
      </header>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
              <th className="py-2 px-3">Client</th>
              <th className="py-2 px-3">ID code</th>
              <th className="py-2 px-3">Active brand book</th>
              <th className="py-2 px-3">Last updated</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.clientIdCode} className="border-b last:border-b-0 hover:bg-muted/50">
                <td className="py-2 px-3 font-medium">{r.clientName ?? "—"}</td>
                <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{r.clientIdCode}</td>
                <td className="py-2 px-3 text-sm">
                  {r.hasGuidelines && r.activeVersion ? (
                    <span>
                      v{r.activeVersion} <span className="text-muted-foreground">— {r.activeFilename}</span>
                    </span>
                  ) : r.hasGuidelines ? (
                    <span className="text-muted-foreground">No active version</span>
                  ) : (
                    <span className="text-muted-foreground">Not set up</span>
                  )}
                </td>
                <td className="py-2 px-3 text-xs text-muted-foreground">
                  {r.lastUpdated ? new Date(r.lastUpdated).toISOString().slice(0, 10) : "—"}
                </td>
                <td className="py-2 px-3">
                  <Link
                    href={`/clients/${r.clientIdCode}/brand-guidelines`}
                    className="text-xs underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
