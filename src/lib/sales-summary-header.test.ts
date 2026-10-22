import { describe, it, expect } from "vitest";
import {
  resolveClientTeam,
  latestDateForAccounts,
  dataLagDays,
  isDataStale,
  STALE_LAG_DAYS,
  teamOrgLevel,
  resolveClientApprovers,
  ppcDirectorLink,
  PPC_DIRECTOR_NAME,
} from "./sales-summary-header";

const users = [
  { name: "Amir Zeb", email: "amir@1o8.agency", image: "https://img/1o8-amir" },
  { name: "Amir Zeb", email: "amir@marketfoundry.agency", image: "https://img/mf-amir" },
  { name: "Jake Kosten", email: "jake@dublite.com", image: "https://img/client-jake" },
  { name: "Jake Kosten", email: "jake@marketfoundry.agency", image: null },
  { name: "Sohail Asghar", email: "sohail@marketfoundry.agency", image: "https://img/sohail" },
  { name: "Luis Abugaber", email: "luis@marketfoundry.agency", image: "https://img/luis" },
];

describe("resolveClientTeam", () => {
  it("returns people in role order with short role labels", () => {
    const team = resolveClientTeam(
      { AccountManager_MF: "Sohail Asghar", PPCManager_MF: "Amir Zeb" },
      users,
    );
    expect(team.map((t) => t.name)).toEqual(["Sohail Asghar", "Amir Zeb", PPC_DIRECTOR_NAME]);
    expect(team[0].roles).toEqual(["Account Manager"]);
    expect(team[1].roles).toEqual(["PPC"]);
    expect(team[0].image).toBe("https://img/sohail");
  });

  it("prefers the @marketfoundry.agency account when a name matches several users", () => {
    const [amir] = resolveClientTeam({ PPCManager_MF: "Amir Zeb" }, users);
    expect(amir.image).toBe("https://img/mf-amir");
  });

  it("prefers the MF account even when it has no image (never shows a client's photo)", () => {
    const [jake] = resolveClientTeam({ ExecutiveStrategist_MF: "Jake Kosten" }, users);
    expect(jake.image).toBeNull();
  });

  it("merges one person holding several roles into a single entry", () => {
    const team = resolveClientTeam(
      { AccountManager_MF: "Sohail Asghar", ProjectManager_MF: " sohail asghar " },
      users,
    );
    expect(team).toHaveLength(1);
    expect(team[0].roles).toEqual(["Account Manager", "Project Manager"]);
  });

  it("keeps unmatched names with a null image (initials fallback)", () => {
    const [md] = resolveClientTeam({ SEOManager_MF: "Md Alam" }, users);
    expect(md).toEqual({ name: "Md Alam", image: null, roles: ["SEO"] });
  });

  it("orders people ES, AM, PM, PPC, SEO, Design, Catalog, then secondary roles", () => {
    const team = resolveClientTeam(
      {
        CatalogManager_MF: "Cat", DesignManager_MF: "Des", SEOManager_MF: "Seo", PPCManager_MF: "Ppc",
        ProjectManager_MF: "Pm", AccountManager_MF: "Am", ExecutiveStrategist_MF: "Es", DesignUploadManager_MF: "Upl",
      },
      users,
    );
    expect(team.map((t) => t.roles[0])).toEqual(["Executive Strategist", "Account Manager", "Project Manager", "PPC", "SEO", "Design", "Catalog", "Design Upload", "PPC Lead"]);
  });

  it("ignores blank values and non-team keys", () => {
    expect(resolveClientTeam({ AccountManager_MF: "  ", BrandName: "Sohail Asghar" }, users)).toEqual([]);
  });
});

describe("latestDateForAccounts", () => {
  const map = new Map([["910420", "2026-09-19"], ["1268300", "2026-09-21"]]);
  it("takes the newest date across a client's accounts", () => {
    expect(latestDateForAccounts(["910420", "1268300"], map)).toBe("2026-09-21");
  });
  it("returns null when no account has sales data", () => {
    expect(latestDateForAccounts(["999"], map)).toBeNull();
    expect(latestDateForAccounts([], map)).toBeNull();
  });
});

describe("dataLagDays / isDataStale", () => {
  it("counts whole days behind the page's newest date", () => {
    expect(dataLagDays("2026-09-19", "2026-09-28")).toBe(9);
    expect(dataLagDays("2026-09-28", "2026-09-28")).toBe(0);
  });
  it("is stale at 2+ days behind, not at 1", () => {
    expect(STALE_LAG_DAYS).toBe(2);
    expect(isDataStale("2026-09-27", "2026-09-28")).toBe(false);
    expect(isDataStale("2026-09-26", "2026-09-28")).toBe(true);
  });
  it("treats a missing client date as stale and a missing reference as not", () => {
    expect(isDataStale(null, "2026-09-28")).toBe(true);
    expect(isDataStale("2026-09-19", null)).toBe(false);
  });
});

describe("teamOrgLevel", () => {
  const m = (roles: string[]) => ({ name: "x", image: null, roles });
  it("maps ES→1, AM→2, PM→3, everything else→4", () => {
    expect(teamOrgLevel(m(["Executive Strategist"]))).toBe(1);
    expect(teamOrgLevel(m(["Account Manager"]))).toBe(2);
    expect(teamOrgLevel(m(["Project Manager", "PM Asana"]))).toBe(3);
    expect(teamOrgLevel(m(["SEO", "Design Upload"]))).toBe(4);
  });
  it("places a multi-role person at their highest level", () => {
    expect(teamOrgLevel(m(["Account Manager", "PPC"]))).toBe(2);
  });
});

describe("resolveClientApprovers", () => {
  const users = [
    { name: "Pat Smith", email: "pat@1o8.agency", image: null },
    { name: "Pat Smith", email: "pat@marketfoundry.agency", image: null },
    { name: "Ann Lee", email: "ann@marketfoundry.agency", image: null },
  ];
  it("maps ProjectManager_MF / AccountManager_MF by name, MF domain wins over @1o8 duplicates", () => {
    expect(resolveClientApprovers({ ProjectManager_MF: " pat  smith ", AccountManager_MF: "Ann Lee" }, users)).toEqual({
      pm: { name: "Pat Smith", email: "pat@marketfoundry.agency" },
      am: { name: "Ann Lee", email: "ann@marketfoundry.agency" },
      es: null,
    });
  });
  it("a name with no matching user keeps the name with email null (Review Focus 2)", () => {
    expect(resolveClientApprovers({ ProjectManager_MF: "Pat Smyth" }, users)).toEqual({ pm: { name: "Pat Smyth", email: null }, am: null, es: null });
  });
  it("resolves the Executive Strategist too (client team ladder override)", () => {
    expect(resolveClientApprovers({ ExecutiveStrategist_MF: "Ann Lee" }, users).es).toEqual({ name: "Ann Lee", email: "ann@marketfoundry.agency" });
  });
  it("missing keys → null", () => {
    expect(resolveClientApprovers({}, users)).toEqual({ pm: null, am: null, es: null });
  });
  it("a non-string value in the client row is treated as missing, never throws", () => {
    const raw = { ProjectManager_MF: 42, AccountManager_MF: { name: "Ann Lee" } } as unknown as Record<string, string>;
    expect(resolveClientApprovers(raw, users)).toEqual({ pm: null, am: null, es: null });
  });
  it("never resolves to a non-staff account, even with a photo (security)", () => {
    const withClientRow = [{ name: "Jake Kosten", email: "jake@dublite.com", image: "https://x/p.png" }];
    expect(resolveClientApprovers({ ProjectManager_MF: "Jake Kosten" }, withClientRow)).toEqual({ pm: { name: "Jake Kosten", email: null }, am: null, es: null });
    const mixed = [...withClientRow, { name: "Jake Kosten", email: "jake@1o8.agency", image: null }];
    expect(resolveClientApprovers({ ProjectManager_MF: "Jake Kosten" }, mixed).pm?.email).toBe("jake@1o8.agency");
  });
});

describe("PPC Lead (Luis Abugaber)", () => {
  it("is added over the PPC manager, with his own avatar", () => {
    const team = resolveClientTeam({ AccountManager_MF: "Sohail Asghar", PPCManager_MF: "Amir Zeb" }, users);
    const luis = team.find((t) => t.name === PPC_DIRECTOR_NAME);
    expect(luis).toEqual({ name: "Luis Abugaber", image: "https://img/luis", roles: ["PPC Lead"] });
  });

  it("is not added to a client with no PPC manager", () => {
    const team = resolveClientTeam({ AccountManager_MF: "Sohail Asghar", SEOManager_MF: "Md Alam" }, users);
    expect(team.some((t) => t.name === PPC_DIRECTOR_NAME)).toBe(false);
  });

  it("sits at the Account Manager level", () => {
    expect(teamOrgLevel({ name: "Luis Abugaber", image: null, roles: ["PPC Lead"] })).toBe(2);
  });

  it("merges into one entry if Luis is also assigned a role on the client", () => {
    const team = resolveClientTeam({ PPCManager_MF: "Amir Zeb", SEOManager_MF: "Luis Abugaber" }, users);
    expect(team.filter((t) => t.name === PPC_DIRECTOR_NAME)).toHaveLength(1);
    expect(team.find((t) => t.name === PPC_DIRECTOR_NAME)!.roles).toEqual(["SEO", "PPC Lead"]);
  });
});

describe("ppcDirectorLink", () => {
  const m = (name: string, roles: string[]) => ({ name, image: null, roles });

  it("pairs the director with the level-4 PPC manager", () => {
    const team = [m("Am", ["Account Manager"]), m("Ppc", ["PPC"]), m("Seo", ["SEO"]), m(PPC_DIRECTOR_NAME, ["PPC Lead"])];
    const link = ppcDirectorLink(team);
    expect(link?.director.name).toBe(PPC_DIRECTOR_NAME);
    expect(link?.ppc.name).toBe("Ppc");
  });

  it("returns null when the PPC manager also holds a higher role (no level-4 PPC to link to)", () => {
    expect(ppcDirectorLink([m("Am", ["Account Manager", "PPC"]), m(PPC_DIRECTOR_NAME, ["PPC Lead"])])).toBeNull();
  });

  it("returns null without a director", () => {
    expect(ppcDirectorLink([m("Ppc", ["PPC"])])).toBeNull();
  });
});
