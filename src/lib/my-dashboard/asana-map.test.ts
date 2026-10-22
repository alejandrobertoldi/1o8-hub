import { describe, expect, it } from "vitest";
import { internalIdDigits, mapAsanaTask, parseClientCode, serviceTagsFor, ASANA_GO_LIVE_FIELD_GID, ASANA_INTERNAL_ID_FIELD_GID, ASANA_PRIORITY_FIELD_GID, ASANA_REPORTING_PROJECT_GID, ASANA_STATUS_FIELD_GID, type AsanaApiTask } from "./asana-map";

const base: AsanaApiTask = {
  gid: "1219163788881638",
  name: "SOP - Listing 24 Pack on AMZ US",
  completed: false,
  due_on: "2026-10-05",
  permalink_url: "https://app.asana.com/x",
  modified_at: "2026-10-06T10:00:00.000Z",
  assignee: { gid: "1", name: "Jo C.", email: "Jo@MarketFoundry.agency" },
  memberships: [
    { project: { gid: "1216016941185454", name: "SOP_SC_US | Sopreme" } },
    { project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA_SC_US | Market Foundry Reporting" } },
  ],
  custom_fields: [
    { gid: ASANA_STATUS_FIELD_GID, enum_value: { name: "🚫Blocked" } },
    { gid: ASANA_PRIORITY_FIELD_GID, enum_value: { name: "P1 - High" } },
    { gid: "999", enum_value: { name: "ignored" } },
  ],
};

describe("parseClientCode", () => {
  it.each([
    ["SOP_SC_US | Sopreme", "SOP_SC_US"],
    ["WHI_SC_US | Whitney Jordan", "WHI_SC_US"],
    ["CFX_SC_US - Culture Fix", "CFX_SC_US"],
    ["GOO_WFM | Goodles Whole Foods", "GOO_WFM"],
    ["AAA_SC_US | Market Foundry Recurring Tasks", null],
    ["MarketfoundryHub", null],
    ["IDS - Tracker", null],
    ["Market Foundry | Research", null],
  ])("%s → %s", (name, expected) => {
    expect(parseClientCode(name)).toBe(expected);
  });
});

describe("mapAsanaTask", () => {
  it("maps a client task with status and priority", () => {
    expect(mapAsanaTask(base)).toEqual({
      gid: "1219163788881638",
      name: "SOP - Listing 24 Pack on AMZ US",
      assigneeEmail: "jo@marketfoundry.agency",
      assigneeName: "Jo C.",
      dueOn: "2026-10-05",
      completed: false,
      clientIdCode: "SOP_SC_US",
      originProjectName: "SOP_SC_US | Sopreme",
      taskStatus: "🚫Blocked",
      priority: "P1 - High",
      permalinkUrl: "https://app.asana.com/x",
      asanaModifiedAt: new Date("2026-10-06T10:00:00.000Z"),
      internalId: null,
      serviceTags: [],
      projectNames: ["SOP_SC_US | Sopreme"],
      completedAt: null,
      goLiveDate: null,
    });
  });

  it("handles unassigned, no due date, internal project, missing custom fields", () => {
    const row = mapAsanaTask({
      ...base,
      assignee: null,
      due_on: null,
      modified_at: undefined,
      memberships: [
        { project: { gid: "1216828913264010", name: "MarketfoundryHub" } },
        { project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA_SC_US | Market Foundry Reporting" } },
      ],
      custom_fields: undefined,
    });
    expect(row).toMatchObject({
      assigneeEmail: null, assigneeName: null, dueOn: null, clientIdCode: null,
      originProjectName: "MarketfoundryHub", taskStatus: null, priority: null, asanaModifiedAt: null,
    });
  });

  it("uses the reporting project only when it is the sole membership", () => {
    const row = mapAsanaTask({
      ...base,
      memberships: [{ project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA_SC_US | Market Foundry Reporting" } }],
    });
    expect(row.originProjectName).toBe("AAA_SC_US | Market Foundry Reporting");
    expect(row.clientIdCode).toBeNull();
  });

  it("tolerates a task with no memberships", () => {
    const r = mapAsanaTask({ ...base, memberships: undefined as unknown as AsanaApiTask["memberships"] });
    expect(r.originProjectName).toBeNull();
    expect(r.clientIdCode).toBeNull();
  });
});

describe("1o8 Agency naming (bare AAC codes)", () => {
  const known = new Set(["KSS", "MSN", "STS", "PKI"]);

  it.each([
    ["KSS | K9 Sport Sack", "KSS"],
    ["STS  - Star Sweat", "STS"],
    ["EXT: MSN | Mission", "MSN"],
    ["PKI | Pikos Institute", "PKI"],
    ["IDS - Tracker", null], // not a client code
    ["OTP - One Time Projects", null],
    ["1o8 | Internal WebDev Team", null],
    ["AAA - 1o8 Agency Reporting", null],
    ["SOP_SC_US - Sopreme", "SOP_SC_US"], // MF-style codes keep working
  ])("%s → %s", (name, expected) => {
    expect(parseClientCode(name, known)).toBe(expected);
  });

  it("ignores bare codes when no known-code list is given (MarketFoundry behaviour)", () => {
    expect(parseClientCode("KSS | K9 Sport Sack")).toBeNull();
  });

  it("prefers the client project over an internal team project", () => {
    const row = mapAsanaTask(
      {
        ...base,
        name: "STS - Creative - Build dummy can",
        memberships: [
          { project: { gid: "1", name: "1o8 | Internal Creative Team Workflow" } },
          { project: { gid: "2", name: "STS  - Star Sweat" } },
          { project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA - 1o8 Agency Reporting" } },
        ],
      },
      known,
    );
    expect(row.clientIdCode).toBe("STS");
    expect(row.originProjectName).toBe("STS  - Star Sweat");
  });

  it("falls back to the task-name prefix for tasks kept only in team projects", () => {
    const row = mapAsanaTask(
      {
        ...base,
        name: "MSN | 12 Days of Gifting: Promo Codes",
        memberships: [
          { project: { gid: "1", name: "1o8 | Internal WebDev Team  " } },
          { project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA - 1o8 Agency Reporting" } },
        ],
      },
      known,
    );
    expect(row.clientIdCode).toBe("MSN");
  });
});

describe("1o8 time-tracking fields", () => {
  const known = new Set(["NNG", "MSN"]);
  const task = (over: Partial<AsanaApiTask>): AsanaApiTask => ({ ...base, ...over });

  it("reads the 1o8 Internal ID and tags the department from team projects", () => {
    const row = mapAsanaTask(
      task({
        name: "NNG I Launch Walking Shawarma LTO",
        completed: true,
        completed_at: "2026-10-15T12:00:00.000Z",
        memberships: [
          { project: { gid: "1", name: "NNG | Naf Naf Grill " } },
          { project: { gid: "2", name: "1o8 | Internal Paid Media Team" } },
          { project: { gid: ASANA_REPORTING_PROJECT_GID, name: "AAA - 1o8 Agency Reporting" } },
        ],
        custom_fields: [
          { gid: ASANA_INTERNAL_ID_FIELD_GID, enum_value: null, display_value: "INT-8356" },
          { gid: ASANA_GO_LIVE_FIELD_GID, enum_value: null, date_value: { date: "2026-10-28" } },
        ],
      }),
      known,
    );
    expect(row).toMatchObject({
      clientIdCode: "NNG",
      internalId: "INT-8356",
      serviceTags: ["Paid Media"],
      projectNames: ["NNG | Naf Naf Grill", "1o8 | Internal Paid Media Team"],
      completedAt: new Date("2026-10-15T12:00:00.000Z"),
      goLiveDate: "2026-10-28",
    });
  });

  it("never treats a 1o8 team project as a client, and maps 1o8's own tasks to 1O8", () => {
    const row = mapAsanaTask(
      task({ name: "1o8 | New Branding Mood Board", memberships: [{ project: { gid: "1", name: "1o8 | Internal Creative Team Workflow" } }] }),
      known,
    );
    expect(row.clientIdCode).toBe("1O8");
    expect(row.serviceTags).toEqual(["Creative"]);
  });

  it("builds the 5-digit project suffix", () => {
    expect(internalIdDigits("INT-8132")).toBe("08132");
    expect(internalIdDigits("INT-12345")).toBe("12345");
    expect(internalIdDigits(null)).toBeNull();
    expect(serviceTagsFor(["1O8 | Internal Email Team", "1o8 | Internal WebDev Team  "])).toEqual(["Email", "Web Dev"]);
  });
});
