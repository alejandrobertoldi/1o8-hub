import { describe, expect, it } from "vitest";
import { buildClientChecklist, serviceNeeds, type ChecklistInput } from "./checklist";

const base = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
  clientIdCode: "ELK",
  rawData: {},
  onboardingDate: null,
  asanaProjectGid: null,
  brandVoice: null,
  guidelines: null,
  klaviyoConnected: false,
  driveFoldersCreated: false,
  completedSteps: new Set(),
  ...over,
});

const keys = (c: ReturnType<typeof buildClientChecklist>) => c.sections.flatMap((s) => s.items.map((i) => i.key));
const item = (c: ReturnType<typeof buildClientChecklist>, key: string) => c.sections.flatMap((s) => s.items).find((i) => i.key === key);

describe("serviceNeeds", () => {
  it("applies everything until services are checked", () => {
    expect(serviceNeeds({})).toMatchObject({ anyService: false, email: true, meta: true, googleAds: true, seo: true });
  });
  it("maps AAC services to what they need", () => {
    const n = serviceNeeds({ "Service: Email": "Email", "Service: Google": "Google" });
    expect(n).toMatchObject({ anyService: true, email: true, googleAds: true, meta: false, web: false, seo: false, social: false });
    expect(serviceNeeds({ "Service: Paid Media": "x" })).toMatchObject({ meta: true, googleAds: true });
  });
});

describe("buildClientChecklist", () => {
  it("only asks for what the client's services need", () => {
    const c = buildClientChecklist(base({ rawData: { "Service: Email": "Email" } }));
    expect(keys(c)).toContain("conn_klaviyo");
    expect(keys(c)).toContain("team_email");
    expect(keys(c)).not.toContain("conn_meta");
    expect(keys(c)).not.toContain("conn_google_ads");
    expect(keys(c)).not.toContain("bv_keywords");
    expect(keys(c)).not.toContain("social_instagram");
    // Always needed, whatever the services.
    expect(keys(c)).toEqual(expect.arrayContaining(["conn_ga4", "bv_value_prop", "bg_logo", "kpi_defined", "ops_asana"]));
  });

  it("reads completion from the profile itself", () => {
    const c = buildClientChecklist(
      base({
        rawData: { "Service: Google": "Google", GoogleAdsCustomerId: "123-456-7890", MainKPIs: JSON.stringify([{ key: "roas", target: "4x" }]) },
        klaviyoConnected: true,
        asanaProjectGid: "123",
      }),
    );
    expect(item(c, "conn_google_ads")?.state).toBe("done");
    expect(item(c, "kpi_defined")?.state).toBe("done");
    expect(item(c, "kpi_targets")?.state).toBe("done");
    expect(item(c, "ops_asana")?.state).toBe("done");
    expect(item(c, "ops_drive")?.state).toBe("missing");
  });

  it("lets manual items be checked and any item be N/A, which leaves the total", () => {
    const before = buildClientChecklist(base({ rawData: { "Service: Meta": "Meta" } }));
    const after = buildClientChecklist(
      base({ rawData: { "Service: Meta": "Meta", "Onboarding: access_meta": "done", "Onboarding: bg_typography": "na", "Onboarding: conn_ga4": "done" } }),
    );
    expect(item(after, "access_meta")?.state).toBe("done");
    expect(item(after, "bg_typography")?.state).toBe("na");
    // A data item can't be ticked by hand: fill the GA4 property instead.
    expect(item(after, "conn_ga4")?.state).toBe("missing");
    expect(after.total).toBe(before.total - 1);
    expect(after.done).toBe(before.done + 1);
  });

  it("links the SOW / quote where dates are read from", () => {
    const url = "https://drive.google.com/file/d/sow/view";
    const c = buildClientChecklist(base({ rawData: { SOWURL: url, SOW: "Retainer", Term: "Signed Jan 6, 2026" } }));
    expect(item(c, "sow_link")?.state).toBe("done");
    expect(item(c, "start_date")?.reference).toEqual({ label: "SOW / quote", url });
    expect(c.contract).toEqual({ sowUrl: url, sow: "Retainer", term: "Signed Jan 6, 2026", lastDay: "" });
    expect(item(buildClientChecklist(base()), "sow_link")?.state).toBe("missing");
  });

  it("counts GA4 / Meta access as granted once a property / ad account is picked", () => {
    const raw = { "Service: Meta": "Meta" };
    expect(item(buildClientChecklist(base({ rawData: raw })), "access_ga4")?.state).toBe("missing");
    const c = buildClientChecklist(base({ rawData: { ...raw, GA4Property: "123", MetaAdAccount: "456" } }));
    expect(item(c, "access_ga4")?.state).toBe("done");
    expect(item(c, "access_meta")?.state).toBe("done");
  });
});

