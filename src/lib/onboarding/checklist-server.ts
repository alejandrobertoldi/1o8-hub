import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { aac, clientBrandGuidelines, clientBrandVoice, clientOnboardingSteps, driveFolders } from "@/lib/db/schema";
import { clientsWithKlaviyo } from "@/lib/kpi/secrets";
import { buildClientChecklist, type ClientChecklist } from "./checklist";

/**
 * The profile checklist for some clients (all when `codes` is omitted), in a
 * fixed number of queries however many clients there are — the summary page
 * used to fire one request per client.
 */
export async function loadClientChecklists(codes?: string[]): Promise<Map<string, ClientChecklist>> {
  const only = <T>(col: T) => (codes ? [inArray(col as never, codes)] : []);
  const [clients, voices, guides, steps, folders, klaviyo] = await Promise.all([
    db
      .select({
        clientIdCode: aac.clientIdCode,
        rawData: aac.rawData,
        clientType: aac.clientType,
        onboardingDate: aac.onboardingDate,
        asanaProjectGid: aac.asanaProjectGid,
      })
      .from(aac)
      .where(and(...only(aac.clientIdCode))),
    db.select().from(clientBrandVoice).where(and(...only(clientBrandVoice.clientIdCode))),
    db
      .select({
        clientIdCode: clientBrandGuidelines.clientIdCode,
        logo: clientBrandGuidelines.summaryLogo,
        colors: clientBrandGuidelines.summaryColors,
        typography: clientBrandGuidelines.summaryTypography,
      })
      .from(clientBrandGuidelines)
      .where(and(...only(clientBrandGuidelines.clientIdCode))),
    db
      .select({ clientIdCode: clientOnboardingSteps.clientIdCode, stepKey: clientOnboardingSteps.stepKey })
      .from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.status, "completed"), ...only(clientOnboardingSteps.clientIdCode))),
    db
      .select({ clientIdCode: driveFolders.clientIdCode })
      .from(driveFolders)
      .where(and(eq(driveFolders.folderType, "client"), ...only(driveFolders.clientIdCode))),
    clientsWithKlaviyo(),
  ]);

  const voiceBy = new Map(voices.map((v) => [v.clientIdCode, v]));
  const guideBy = new Map(guides.map((g) => [g.clientIdCode, g]));
  const stepsBy = new Map<string, Set<string>>();
  for (const s of steps) {
    const set = stepsBy.get(s.clientIdCode) ?? new Set<string>();
    set.add(s.stepKey);
    stepsBy.set(s.clientIdCode, set);
  }
  const withFolders = new Set(folders.map((f) => f.clientIdCode));

  const out = new Map<string, ClientChecklist>();
  for (const c of clients) {
    const g = guideBy.get(c.clientIdCode);
    const logo = g?.logo;
    out.set(
      c.clientIdCode,
      buildClientChecklist({
        clientIdCode: c.clientIdCode,
        rawData: (c.rawData ?? {}) as Record<string, unknown>,
        clientType: c.clientType,
        onboardingDate: c.onboardingDate ? c.onboardingDate.toISOString().slice(0, 10) : null,
        asanaProjectGid: c.asanaProjectGid,
        brandVoice: voiceBy.get(c.clientIdCode) ?? null,
        guidelines: g
          ? {
              hasLogo: !!(logo?.primary_url || logo?.primary_description),
              colors: g.colors?.length ?? 0,
              hasTypography: !!g.typography?.primary?.family,
            }
          : null,
        klaviyoConnected: klaviyo.has(c.clientIdCode.toUpperCase()),
        driveFoldersCreated: withFolders.has(c.clientIdCode),
        completedSteps: stepsBy.get(c.clientIdCode) ?? new Set(),
      }),
    );
  }
  return out;
}
