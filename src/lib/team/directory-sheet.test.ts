import { describe, expect, it } from "vitest";
import { cleanPhone, departmentsFor, leadRank, parseTeamSheet, placeholderEmail } from "./directory-sheet";

const header = [
  "", "Team Member", "Company", "Title", "Expertise", "Type", "Location", "Phone Number", "Time Zone",
  "Difference with Chicago", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN",
  "Local Time Start", "Local Time End", "Chicago Time Start", "Chicago Time End", "UTC Difference", "VPN Code",
  "", "", "Time Zone",
];
const row = (v: Record<string, string>) => header.map((h) => v[h] ?? "");
const week = { MON: "TRUE", TUE: "TRUE", WED: "TRUE", THU: "TRUE", FRI: "TRUE", SAT: "FALSE", SUN: "FALSE" };

describe("parseTeamSheet", () => {
  const grid = [
    [],
    ["", "", "", "", "", "", "", "", "Daylight Saving Time (US) in effect", "TRUE"],
    header,
    row({
      "Team Member": "Ryshel Hipolito", Title: "Email Support", Expertise: "Email Marketing Management",
      Type: "Independent Contractor ", Location: "Rizal, PHILIPPINES", "Phone Number": "ph. +63 917 000 0000",
      "Time Zone": "PHT (UTC+8)", ...week, "Local Time Start": "10:00 PM", "Local Time End": "06:00 AM",
      "Chicago Time Start": "09:00 AM", "Chicago Time End": "05:00 PM", "VPN Code": "SECRET-123",
    }),
    row({ "Team Member": "Jason Mann", Title: "Copy Writer", Expertise: "Creative Services", ...week, "Local Time Start": "12:00 AM", "Local Time End": "12:00 AM" }),
    row({ "Team Member": "Aalap Shah", Title: "Owner/Sales", Expertise: "Owner", Type: "Owner", ...week }),
    row({ "Team Member": "Add start dates" }),
    row({ "Team Member": "Jason Mann", Title: "Copy Writer" }),
  ];
  const { members, warnings } = parseTeamSheet(grid);

  it("parses directory fields and never reads the VPN code", () => {
    const r = members[0];
    expect(r).toMatchObject({
      name: "Ryshel Hipolito",
      employmentType: "Independent Contractor",
      phone: "+63 917 000 0000",
      timeZone: "PHT (UTC+8)",
      workDays: ["mon", "tue", "wed", "thu", "fri"],
      workStartLocal: "10:00 PM",
      workEndLocal: "06:00 AM",
      workStartChicago: "09:00 AM",
      departments: ["email"],
    });
    expect(JSON.stringify(members)).not.toContain("SECRET-123");
  });

  it("blanks placeholder hours, skips notes and duplicates", () => {
    expect(members.map((m) => m.name)).toEqual(["Ryshel Hipolito", "Jason Mann", "Aalap Shah"]);
    expect(members[1].workStartLocal).toBeNull();
    expect(warnings.some((w) => w.includes("duplicate"))).toBe(true);
  });

  it("puts owners in no department (they are the Leadership band)", () => {
    expect(members[2].departments).toEqual([]);
  });
});

describe("helpers", () => {
  it("maps expertise to 1o8 departments", () => {
    expect(departmentsFor("Website Services", "Web Support")).toEqual(["web"]);
    expect(departmentsFor("Paid Media ", "Paid Media ")).toEqual(["paid_media"]);
    expect(departmentsFor("HR Services", "HR Manager")).toEqual(["hr"]);
    expect(departmentsFor(null, "Copy Writer")).toEqual(["creative"]);
  });
  it("cleans phones and builds placeholder emails", () => {
    expect(cleanPhone("ph. 6307420182")).toBe("6307420182");
    expect(cleanPhone("")).toBeNull();
    expect(placeholderEmail("Andrés Máximo Máximo")).toBe("andres.maximo@1o8.agency");
  });
  it("ranks lead titles", () => {
    expect(leadRank("Executive Creative Director")).toBe(2);
    expect(leadRank("Email Manager")).toBe(1);
    expect(leadRank("Account Manager")).toBe(0);
    expect(leadRank("Designer")).toBe(0);
  });
});
