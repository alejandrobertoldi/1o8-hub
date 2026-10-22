import { describe, expect, it } from "vitest";
import {
  buildSeoProjectNameOptions,
  buildSeoVersionOptions,
  displaySeoProjectName,
  ensureCurrentVersionOption,
  INHERITED_PROJECT_NAME,
  matchVersionSelectValue,
  normalizeSeoVersionNumber,
  parseVersionOptionValue,
  resolveSeoPairFromProject,
  resolveSeoPairFromVersion,
  versionOptionValue,
  type SeoProjectOption,
} from "./seo-product-options";

describe("normalizeSeoVersionNumber", () => {
  it("keeps version 0 instead of treating it as empty", () => {
    expect(normalizeSeoVersionNumber("0")).toBe("0");
    expect(normalizeSeoVersionNumber(0)).toBe("0");
    expect(normalizeSeoVersionNumber("")).toBeNull();
    expect(normalizeSeoVersionNumber(null)).toBeNull();
  });
});

describe("buildSeoVersionOptions", () => {
  it("always includes CLR version 0 even when no other SEO exists", () => {
    const options = buildSeoVersionOptions({ bqVersions: [], projects: [] });
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      seoVersionNumber: "0",
      seoCategory: "Inherited",
      source: "clr",
      projectName: null,
      label: "0 · Inherited (CLR)",
    });
  });

  it("adds BigQuery versions after 0 and keeps CLR first", () => {
    const options = buildSeoVersionOptions({
      bqVersions: [
        { seoVersionNumber: "2", seoCategory: "SEO", seoStatus: "Current" },
        { seoVersionNumber: "0", seoCategory: "Inherited", seoStatus: "Onboarding" },
      ],
      projects: [],
    });
    expect(options.map((o) => o.seoVersionNumber)).toEqual(["0", "2"]);
    expect(options[0].source).toBe("clr");
    expect(options[1]).toMatchObject({
      source: "bq",
      label: "2 · SEO",
      projectName: null,
    });
  });

  it("adds SEO Manager project versions that are not version 0", () => {
    const options = buildSeoVersionOptions({
      bqVersions: [],
      projects: [
        { name: "HAL SEO V1", version: 1 },
        { name: "Should skip", version: 0 },
      ],
    });
    expect(options.map((o) => o.seoVersionNumber)).toEqual(["0", "1"]);
    expect(options[1]).toMatchObject({
      source: "manager",
      label: "1 · HAL SEO V1",
      projectName: "HAL SEO V1",
    });
  });

  it("merges a BQ row and manager project that share a version number", () => {
    const options = buildSeoVersionOptions({
      bqVersions: [
        { seoVersionNumber: "1", seoCategory: "SEO", seoStatus: "Current" },
      ],
      projects: [{ name: "HAL SEO V1", version: 1 }],
    });
    const v1 = options.filter((o) => o.seoVersionNumber === "1");
    expect(v1).toHaveLength(1);
    expect(v1[0]).toMatchObject({
      source: "bq",
      projectName: "HAL SEO V1",
      seoCategory: "SEO",
      label: "1 · HAL SEO V1",
    });
  });

  it("does not duplicate a BQ inherited row already represented by CLR", () => {
    const options = buildSeoVersionOptions({
      bqVersions: [
        { seoVersionNumber: "0", seoCategory: "Inherited", seoStatus: "Onboarding" },
      ],
      projects: [],
    });
    expect(options).toHaveLength(1);
  });
});

describe("version option value", () => {
  it("round-trips number and category", () => {
    const value = versionOptionValue("1", "HAL SEO");
    expect(parseVersionOptionValue(value)).toEqual({
      seoVersionNumber: "1",
      seoCategory: "HAL SEO",
    });
  });
});

describe("ensureCurrentVersionOption", () => {
  it("adds the product's current version when it is missing from known SEO", () => {
    const base = buildSeoVersionOptions({ bqVersions: [], projects: [] });
    const options = ensureCurrentVersionOption(base, "3");
    expect(options.map((o) => o.seoVersionNumber)).toEqual(["0", "3"]);
  });

  it("does not add a duplicate when the number already exists", () => {
    const base = buildSeoVersionOptions({
      bqVersions: [],
      projects: [{ name: "HAL SEO V1", version: 1 }],
    });
    const options = ensureCurrentVersionOption(base, "1");
    expect(options.filter((o) => o.seoVersionNumber === "1")).toHaveLength(1);
  });
});

describe("matchVersionSelectValue", () => {
  it("matches the merged version that carries the current project name", () => {
    const options = buildSeoVersionOptions({
      bqVersions: [
        { seoVersionNumber: "1", seoCategory: "SEO", seoStatus: "Current" },
      ],
      projects: [{ name: "HAL SEO V1", version: 1 }],
    });
    const value = matchVersionSelectValue(options, "1", "SEO", "HAL SEO V1");
    expect(parseVersionOptionValue(value).seoVersionNumber).toBe("1");
  });

  it("falls back to CLR when the product has no version number", () => {
    const options = buildSeoVersionOptions({ bqVersions: [], projects: [] });
    expect(matchVersionSelectValue(options, "")).toBe(
      versionOptionValue("0", "Inherited")
    );
  });
});

describe("linked project and version pairs", () => {
  const projects: SeoProjectOption[] = [
    {
      id: "a",
      name: "HAL SEO V1",
      version: 1,
      status: "live",
      linkedToProduct: true,
    },
    {
      id: "b",
      name: "HAL SEO V2",
      version: 2,
      status: "draft",
      linkedToProduct: false,
    },
  ];

  const versions = buildSeoVersionOptions({
    bqVersions: [
      { seoVersionNumber: "1", seoCategory: "SEO", seoStatus: "Current" },
    ],
    projects,
  });

  it("picking a project selects that project's version", () => {
    const pair = resolveSeoPairFromProject(projects, versions, "HAL SEO V2");
    expect(pair).toMatchObject({
      projectName: "HAL SEO V2",
      seoVersionNumber: "2",
    });
  });

  it("picking a manager version selects that project's name", () => {
    const v2 = versions.find((o) => o.seoVersionNumber === "2")!;
    expect(resolveSeoPairFromVersion(projects, v2)).toMatchObject({
      projectName: "HAL SEO V2",
      seoVersionNumber: "2",
    });
  });

  it("picking CLR version 0 clears the project name", () => {
    const v0 = versions.find((o) => o.source === "clr")!;
    expect(resolveSeoPairFromVersion(projects, v0)).toMatchObject({
      projectName: null,
      seoVersionNumber: "0",
      source: "clr",
    });
  });

  it("picking Inherited version selects CLR version 0 without saving a project name", () => {
    const pair = resolveSeoPairFromProject(
      projects,
      versions,
      INHERITED_PROJECT_NAME
    );
    expect(pair).toMatchObject({
      projectName: null,
      seoVersionNumber: "0",
      source: "clr",
    });
  });
});

describe("buildSeoProjectNameOptions", () => {
  const projects: SeoProjectOption[] = [
    {
      id: "b",
      name: "Beta SEO",
      version: 2,
      status: "draft",
      linkedToProduct: false,
    },
    {
      id: "a",
      name: "Alpha SEO",
      version: 1,
      status: "live",
      linkedToProduct: true,
    },
    {
      id: "dup",
      name: "Alpha SEO",
      version: 3,
      status: "draft",
      linkedToProduct: false,
    },
  ];

  it("lists unique project names with Inherited version first, then linked listings", () => {
    const options = buildSeoProjectNameOptions(projects, "");
    expect(options.map((o) => o.value)).toEqual([
      INHERITED_PROJECT_NAME,
      "Alpha SEO",
      "Beta SEO",
    ]);
  });

  it("keeps a current name that is not in SEO Manager", () => {
    const options = buildSeoProjectNameOptions(projects, "Legacy Name");
    expect(options[0]).toEqual({ value: "Legacy Name", label: "Legacy Name" });
    expect(options.map((o) => o.value)).toContain(INHERITED_PROJECT_NAME);
  });

  it("does not duplicate Inherited version when it is the current name", () => {
    const options = buildSeoProjectNameOptions(projects, INHERITED_PROJECT_NAME);
    expect(options.filter((o) => o.value === INHERITED_PROJECT_NAME)).toHaveLength(1);
  });
});

describe("displaySeoProjectName", () => {
  it("shows Inherited version when the selected version is 0", () => {
    expect(
      displaySeoProjectName({
        currentProjectName: "HAL SEO V1",
        versionNumber: "0",
      })
    ).toBe(INHERITED_PROJECT_NAME);
  });

  it("shows Inherited version for CLR even if a stale project name is stored", () => {
    expect(
      displaySeoProjectName({
        currentProjectName: "HAL SEO V1",
        versionNumber: "1",
        versionSource: "clr",
      })
    ).toBe(INHERITED_PROJECT_NAME);
  });

  it("keeps the real project name for manager versions", () => {
    expect(
      displaySeoProjectName({
        currentProjectName: "HAL SEO V1",
        versionNumber: "1",
        versionSource: "manager",
        linkedFromVersion: "HAL SEO V1",
      })
    ).toBe("HAL SEO V1");
  });
});
