import { describe, it, expect } from "vitest";
import {
  TEAM_DEPARTMENTS,
  TEAM_DEPARTMENT_LABELS,
  MAX_JOB_TITLES,
  MAX_JOB_TITLE_LENGTH,
  isTeamDepartment,
  isOrgLevelDepartment,
  normalizeJobTitles,
  normalizeDepartments,
  displayJobTitles,
  buildCompanyScale,
  orgLevelFromTitles,
  orgLevel,
  buildOrgTree,
  type OrgMember,
} from "./departments";

describe("isTeamDepartment", () => {
  it("accepts every published department", () => {
    for (const id of TEAM_DEPARTMENTS) {
      expect(isTeamDepartment(id)).toBe(true);
      expect(TEAM_DEPARTMENT_LABELS[id]).toBeTruthy();
    }
  });

  it("rejects unknown, blank, and non-string values", () => {
    expect(isTeamDepartment("engineering")).toBe(false);
    expect(isTeamDepartment("ADMIN")).toBe(false);
    expect(isTeamDepartment("")).toBe(false);
    expect(isTeamDepartment(null)).toBe(false);
    expect(isTeamDepartment(undefined)).toBe(false);
  });
});

describe("normalizeJobTitles", () => {
  it("trims, drops empties, and de-dupes case-insensitively", () => {
    expect(
      normalizeJobTitles([" President ", "", "president", "Head of Catalog"])
    ).toEqual({ ok: ["President", "Head of Catalog"] });
  });

  it("accepts an empty list", () => {
    expect(normalizeJobTitles([])).toEqual({ ok: [] });
  });

  it("rejects a non-array", () => {
    expect(normalizeJobTitles("President")).toEqual({
      error: "jobTitles must be an array of strings",
    });
  });

  it("rejects a non-string entry", () => {
    expect(normalizeJobTitles(["President", 1])).toEqual({
      error: "jobTitles must be an array of strings",
    });
  });

  it(`rejects more than ${MAX_JOB_TITLES} entries`, () => {
    const tooMany = Array.from({ length: MAX_JOB_TITLES + 1 }, (_, i) => `T${i}`);
    expect(normalizeJobTitles(tooMany)).toEqual({
      error: `jobTitles may have at most ${MAX_JOB_TITLES} entries`,
    });
  });

  it(`rejects a title over ${MAX_JOB_TITLE_LENGTH} characters`, () => {
    expect(normalizeJobTitles(["P".repeat(MAX_JOB_TITLE_LENGTH + 1)])).toEqual({
      error: `each job title must be at most ${MAX_JOB_TITLE_LENGTH} characters`,
    });
  });
});

describe("displayJobTitles", () => {
  it("prefers the array when it has entries", () => {
    expect(displayJobTitles("Old", ["President", "Head of Catalog"])).toEqual([
      "President",
      "Head of Catalog",
    ]);
  });

  it("falls back to the legacy single title", () => {
    expect(displayJobTitles("President", [])).toEqual(["President"]);
    expect(displayJobTitles("President", null)).toEqual(["President"]);
  });

  it("returns empty when neither is set", () => {
    expect(displayJobTitles(null, [])).toEqual([]);
    expect(displayJobTitles(null, null)).toEqual([]);
  });
});

describe("buildCompanyScale", () => {
  it("counts each membership; a person in two departments hits both bars", () => {
    const scale = buildCompanyScale([
      { departments: ["creative", "seo"] },
      { departments: ["creative"] },
      { departments: [] },
      { departments: ["unknown"] },
    ]);
    // design 2, seo 1, unassigned 2 (empty + all-invalid); total = sum = 5
    expect(scale.total).toBe(5);
    expect(scale.rows.find((r) => r.id === "creative")?.count).toBe(2);
    expect(scale.rows.find((r) => r.id === "seo")?.count).toBe(1);
    expect(scale.rows.find((r) => r.id === "unassigned")?.count).toBe(2);
    expect(scale.rows.find((r) => r.id === "finance")).toBeUndefined();
  });

  it("returns a zero total with no rows for an empty team", () => {
    expect(buildCompanyScale([])).toEqual({ total: 0, rows: [] });
  });
});

describe("orgLevelFromTitles", () => {
  it("ranks President above everything else", () => {
    expect(orgLevelFromTitles("President", ["President", "Head of Catalog"])).toBe(
      "president"
    );
  });

  it("detects account and project managers, not other managers", () => {
    expect(orgLevelFromTitles("Account Manager", [])).toBe("am");
    expect(orgLevelFromTitles("Project Manager", [])).toBe("pm");
    expect(orgLevelFromTitles("PPC Manager", [])).toBe("member");
    expect(orgLevelFromTitles("Catalog Manager", [])).toBe("member");
    expect(orgLevelFromTitles("SEO Manager", [])).toBe("member");
    expect(orgLevelFromTitles("PPC Lead", [])).toBe("member");
  });
});

describe("orgLevel", () => {
  it("title president wins over any department", () => {
    expect(
      orgLevel({
        jobTitle: "President",
        jobTitles: ["President"],
        departments: ["project_management"],
      })
    ).toBe("president");
  });

  it("account_management department promotes a non-manager title to am", () => {
    expect(
      orgLevel({
        jobTitle: "SEO Manager",
        jobTitles: ["SEO Manager"],
        departments: ["account_management"],
      })
    ).toBe("am");
  });

  it("project_management department promotes a non-manager title to pm", () => {
    expect(
      orgLevel({
        jobTitle: "SEO Manager",
        jobTitles: ["SEO Manager"],
        departments: ["seo", "hr", "project_management"],
      })
    ).toBe("pm");
  });

  it("both org-level departments resolve to am (am wins)", () => {
    expect(
      orgLevel({
        jobTitle: "Generalist",
        jobTitles: ["Generalist"],
        departments: ["account_management", "project_management"],
      })
    ).toBe("am");
  });

  it("neither department nor a manager title stays member", () => {
    expect(
      orgLevel({
        jobTitle: "Designer",
        jobTitles: ["Designer"],
        departments: ["creative"],
      })
    ).toBe("member");
  });
});

describe("isOrgLevelDepartment", () => {
  it("flags account_management and project_management only", () => {
    expect(isOrgLevelDepartment("account_management")).toBe(true);
    expect(isOrgLevelDepartment("project_management")).toBe(true);
    expect(isOrgLevelDepartment("creative")).toBe(false);
    expect(isOrgLevelDepartment("engineering")).toBe(false);
    expect(isOrgLevelDepartment(null)).toBe(false);
  });
});

describe("buildOrgTree", () => {
  const person = (
    id: string,
    name: string,
    title: string,
    departments: string[] = [],
    leadsDepartments: string[] = []
  ): OrgMember => ({
    id,
    name,
    email: `${id}@marketfoundry.agency`,
    image: null,
    jobTitle: title,
    jobTitles: [title],
    departments,
    leadsDepartments,
  });

  it("splits four levels; account/project management are bands not columns", () => {
    const tree = buildOrgTree([
      person("jake", "Jake", "President"),
      person("manu", "Manu", "Account Manager", ["account_management"], ["account_management"]),
      person("hamid", "Hamid", "Project Manager", ["project_management"]),
      person("alvin", "Alvin", "Designer", ["creative"]),
      person("ruslan", "Ruslan", "PPC Manager", ["paid_media"]),
    ]);
    expect(tree.president.map((m) => m.id)).toEqual(["jake"]);
    expect(tree.ams.map((m) => m.id)).toEqual(["manu"]);
    expect(tree.pms.map((m) => m.id)).toEqual(["hamid"]);
    expect(tree.departments.map((d) => d.id)).toEqual([
      "creative",
      "paid_media",
      "finance",
      "hr",
    ]);
    expect(tree.departments.some((d) => d.id === "account_management")).toBe(false);
  });

  it("renders a multi-department member under EACH of their departments", () => {
    const tree = buildOrgTree([
      person("sam", "Sam", "Designer", ["creative", "seo"]),
    ]);
    expect(tree.departments.find((d) => d.id === "creative")?.members.map((m) => m.id)).toEqual(["sam"]);
    expect(tree.departments.find((d) => d.id === "seo")?.members.map((m) => m.id)).toEqual(["sam"]);
  });

  it("surfaces a lead from OUTSIDE the department, keyed on leadsDepartments", () => {
    const tree = buildOrgTree([
      person("manu", "Manu", "Account Manager", ["account_management"], ["creative", "social_media"]),
      person("alvin", "Alvin", "Designer", ["creative"]),
    ]);
    const design = tree.departments.find((d) => d.id === "creative");
    expect(design?.lead?.id).toBe("manu");
    expect(design?.members.map((m) => m.id)).toEqual(["alvin"]);
  });

  it("pushes admin then finance to the right end of the department row (Manu 2026-09-21)", () => {
    const tree = buildOrgTree([
      person("d1", "Dana", "Designer", ["creative"]),
      person("s1", "Sara", "SEO Specialist", ["seo"]),
      person("f1", "Finn", "Accountant", ["finance"]),
      person("a1", "Amy", "Office Admin", ["hr"]),
    ]);
    expect(tree.departments.map((d) => d.id)).toEqual([
      "creative",
      "seo",
      "finance",
      "hr",
    ]);
  });

  it("always renders admin and finance columns, even with zero members, rightmost with finance last", () => {
    const tree = buildOrgTree([
      person("d1", "Dana", "Designer", ["creative"]),
      person("s1", "Sara", "SEO Specialist", ["seo"]),
    ]);
    expect(tree.departments.map((d) => d.id)).toEqual([
      "creative",
      "seo",
      "finance",
      "hr",
    ]);
    const admin = tree.departments.find((d) => d.id === "hr");
    const finance = tree.departments.find((d) => d.id === "finance");
    expect(admin?.members).toEqual([]);
    expect(admin?.candidates).toEqual([]);
    expect(finance?.members).toEqual([]);
    expect(finance?.candidates).toEqual([]);
  });

  it("a non-manager title with a project_management department lands in pms AND in every non-org-level department column it belongs to (Sohail case)", () => {
    const tree = buildOrgTree([
      person("sohail", "Sohail", "SEO Manager", ["seo", "hr", "project_management"]),
    ]);
    expect(tree.pms.map((m) => m.id)).toEqual(["sohail"]);
    expect(tree.ams.map((m) => m.id)).toEqual([]);
    expect(
      tree.departments.find((d) => d.id === "seo")?.members.map((m) => m.id)
    ).toEqual(["sohail"]);
    expect(
      tree.departments.find((d) => d.id === "hr")?.members.map((m) => m.id)
    ).toEqual(["sohail"]);
    const otherCols = tree.departments.filter(
      (d) => d.id !== "seo" && d.id !== "hr"
    );
    for (const col of otherCols) {
      expect(col.members.map((m) => m.id)).not.toContain("sohail");
    }
  });

  it("a non-manager title with an account_management department lands in ams AND in its department column (Luis case)", () => {
    const tree = buildOrgTree([
      person("luis", "Luis", "Catalog Manager", ["web", "account_management"]),
    ]);
    expect(tree.ams.map((m) => m.id)).toEqual(["luis"]);
    expect(tree.pms.map((m) => m.id)).toEqual([]);
    expect(
      tree.departments.find((d) => d.id === "web")?.members.map((m) => m.id)
    ).toEqual(["luis"]);
    const otherCols = tree.departments.filter((d) => d.id !== "web");
    for (const col of otherCols) {
      expect(col.members.map((m) => m.id)).not.toContain("luis");
    }
  });

  it("a Project Manager title still lands in pms with no project_management department", () => {
    const tree = buildOrgTree([person("hamid", "Hamid", "Project Manager", ["seo"])]);
    expect(tree.pms.map((m) => m.id)).toEqual(["hamid"]);
  });
});

describe("normalizeDepartments", () => {
  it("dedupes and preserves order for valid ids", () => {
    expect(normalizeDepartments(["creative", "seo", "creative"])).toEqual({
      ok: ["creative", "seo"],
    });
  });
  it("accepts an empty list", () => {
    expect(normalizeDepartments([])).toEqual({ ok: [] });
  });
  it("rejects a non-array", () => {
    expect(normalizeDepartments("creative")).toEqual({
      error: "departments must be an array of department ids",
    });
  });
  it("rejects an unknown id", () => {
    expect(normalizeDepartments(["creative", "engineering"])).toEqual({
      error: `departments must all be one of ${TEAM_DEPARTMENTS.join(", ")}`,
    });
  });
});
