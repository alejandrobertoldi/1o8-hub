import { describe, expect, it } from "vitest";
import { canUseNewBusiness, isPitchProjectNumber, opportunitySchema, pipelineTotals, pitchProjectNumber } from ".";

describe("pitch project numbers", () => {
  it("pads the sequence under 1O87", () => {
    expect(pitchProjectNumber(1)).toBe("1O870001");
    expect(pitchProjectNumber(123)).toBe("1O870123");
  });
  it("recognises pitch numbers only", () => {
    expect(isPitchProjectNumber("1O870001")).toBe(true);
    expect(isPitchProjectNumber("1o870001")).toBe(true);
    expect(isPitchProjectNumber("1O890003")).toBe(false);
    expect(isPitchProjectNumber("BRN08399")).toBe(false);
  });
});

describe("canUseNewBusiness", () => {
  it("lets owners in without the section", () => {
    expect(canUseNewBusiness("owner", [])).toBe(true);
  });
  it("needs the section for super admins, admins and editors", () => {
    expect(canUseNewBusiness("super_admin", [])).toBe(false);
    expect(canUseNewBusiness("super_admin", ["new-business"])).toBe(true);
    expect(canUseNewBusiness("admin", [])).toBe(false);
    expect(canUseNewBusiness("editor", ["calendar"])).toBe(false);
    expect(canUseNewBusiness("editor", ["new-business"])).toBe(true);
  });
  it("never lets viewers or portal roles in", () => {
    expect(canUseNewBusiness("viewer", ["new-business"])).toBe(false);
    expect(canUseNewBusiness("client", ["new-business"])).toBe(false);
  });
});

describe("opportunitySchema", () => {
  it("normalises empty optional fields to null", () => {
    const r = opportunitySchema.parse({ prospectName: " Griller's Gold ", website: "", contactEmail: "", ownerId: "", source: "", value: null });
    expect(r).toMatchObject({ prospectName: "Griller's Gold", website: null, contactEmail: null, ownerId: null, source: null, value: null, stage: "contact", dealType: "retainer" });
  });
  it("rejects an unknown stage", () => {
    expect(opportunitySchema.safeParse({ prospectName: "X", stage: "signed" }).success).toBe(false);
  });
});

describe("pipelineTotals", () => {
  it("keeps retainers and projects apart and skips closed deals", () => {
    const t = pipelineTotals([
      { stage: "building_pitch", dealType: "retainer", value: 10_000 },
      { stage: "quote_sent", dealType: "project", value: 20_000 },
      { stage: "won", dealType: "retainer", value: 5_000 },
      { stage: "contact", dealType: "retainer", value: null },
    ]);
    expect(t.retainer).toEqual({ total: 10_000, weighted: 4_000, count: 2 });
    expect(t.project).toEqual({ total: 20_000, weighted: 15_000, count: 1 });
  });
});
