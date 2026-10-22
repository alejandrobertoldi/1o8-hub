import { describe, expect, it } from "vitest";
import { assigneeKey, chicagoToday, matchAssignee, matchProvider, readinessDepartmentFor, readinessPct } from "./match";

const people = [
  { id: "barb", name: "Barbara McDonald", email: "barbara.mcdonald@1o8.agency", asanaEmail: null },
  { id: "ryan", name: "Ryan Markie", email: "ryan.markie@1o8.agency", asanaEmail: null },
  { id: "jmann", name: "Jason Mann", email: "jason.mann@1o8.agency", asanaEmail: null },
  { id: "jgeis", name: "Jason Geis", email: "jason.geis@1o8.agency", asanaEmail: null },
  { id: "ryshel", name: "Ryshel Hipolito", email: "ryshel.hipolito@1o8.agency", asanaEmail: null },
  { id: "med", name: "Med Othman", email: "med.othman@1o8.agency", asanaEmail: null },
  { id: "chohdi", name: "Chohdi Othman", email: "chohdi.othman@1o8.agency", asanaEmail: "othman@1o8.agency" },
  { id: "paulina", name: "Paulina Gonzalez", email: "paulina.gonzalez@1o8.agency", asanaEmail: null },
  { id: "andres", name: "Andrés Máximo Máximo", email: "andres.maximo@1o8.agency", asanaEmail: null },
];

describe("matchAssignee", () => {
  it.each([
    [{ name: "Barb McDonald", email: "barbara.mcdonald@1o8.agency" }, "barb"],
    [{ name: "Andrés Gastin", email: "andres.maximo@1o8.agency" }, "andres"], // email wins over a different surname
    [{ name: "Chohdi Othman", email: "othman@1o8.agency" }, "chohdi"], // Asana email on file
    [{ name: "Markie", email: null }, "ryan"],
    [{ name: "JMann", email: null }, "jmann"],
    [{ name: "Rye Hipolito", email: "klaviyo@1o8.agency" }, "ryshel"],
    [{ name: "med saad ben othman", email: "med@pinwheel.agency" }, "med"],
    [{ name: "Paulina González", email: null }, "paulina"],
  ])("%o → %s", (assignee, id) => {
    expect(matchAssignee(assignee, people)?.id).toBe(id);
  });

  it("returns null for vendors and client contacts", () => {
    expect(matchAssignee({ name: "WODO", email: "projects.wodo@gmail.com" }, people)).toBeNull();
    expect(matchAssignee({ name: "amctague@mission.com", email: "amctague@mission.com" }, people)).toBeNull();
  });
});

describe("matchProvider", () => {
  const providers = [
    { id: "wodo", name: "WODO", emails: ["projects.wodo@gmail.com"] },
    { id: "althea", name: "Althea Ordonez", emails: ["Althea.Ordonez@1o8.agency"] },
  ];
  it("matches by any email, case-insensitive", () => {
    expect(matchProvider({ name: "Someone", email: "althea.ordonez@1o8.agency" }, providers)?.id).toBe("althea");
  });
  it("falls back to the exact (accent-insensitive) name", () => {
    expect(matchProvider({ name: "wodo", email: null }, providers)?.id).toBe("wodo");
    expect(matchProvider({ name: "Althea Ordoñez", email: null }, providers)?.id).toBe("althea");
  });
  it("returns null for anyone else", () => {
    expect(matchProvider({ name: "Barb McDonald", email: "barbara.mcdonald@1o8.agency" }, providers)).toBeNull();
  });
});

describe("helpers", () => {
  it("computes readiness like the sheet", () => {
    expect(readinessPct(411, 131)).toBe(68.13);
    expect(readinessPct(0, 0)).toBe(100);
  });
  it("maps team departments to readiness departments", () => {
    expect(readinessDepartmentFor(["account_management"])).toBe("AM");
    expect(readinessDepartmentFor(["social_media"])).toBe("Creative");
    expect(readinessDepartmentFor(["seo"])).toBe("Web");
    expect(readinessDepartmentFor([])).toBeNull();
  });
  it("keys assignees by email, else name", () => {
    expect(assigneeKey({ name: "X", email: "A@B.com " })).toBe("a@b.com");
    expect(assigneeKey({ name: "Markie", email: null })).toBe("name:markie");
    expect(assigneeKey({ name: null, email: null })).toBe("unassigned");
  });
  it("uses Chicago's calendar day", () => {
    expect(chicagoToday(new Date("2026-10-22T03:00:00Z"))).toBe("2026-10-21");
    expect(chicagoToday(new Date("2026-10-22T15:00:00Z"))).toBe("2026-10-22");
  });
});
