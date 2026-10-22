import { describe, it, expect } from "vitest";
import { actionNeedsNote, actionsFor, isOpen, nextStatus, stageLabel, staffActedAs, stepFor } from "./revision-rules";

const approvers = { pm: { name: "Pat PM", email: "pat@marketfoundry.agency" }, am: { name: "Ann AM", email: "ann@marketfoundry.agency" } };

describe("transitions", () => {
  it.each([
    ["pm_review", "approve", "am_review"],
    ["pm_review", "request_changes", "changes_requested"],
    ["am_review", "send_to_client", "client_review"],
    ["am_review", "approve_final", "approved"],
    ["am_review", "request_changes", "changes_requested"],
    ["client_review", "approve", "approved"],
    ["client_review", "request_changes", "changes_requested"],
  ] as const)("%s + %s → %s", (from, action, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });
  it.each([
    ["pm_review", "send_to_client"],
    ["pm_review", "approve_final"],
    ["client_review", "send_to_client"],
    ["client_review", "approve_final"],
    ["approved", "approve"],
    ["changes_requested", "approve"],
  ] as const)("%s + %s is forbidden", (from, action) => {
    expect(nextStatus(from, action)).toBeNull();
  });
  it("step and actions per state", () => {
    expect(stepFor("pm_review")).toBe("pm");
    expect(stepFor("am_review")).toBe("am");
    expect(stepFor("client_review")).toBe("client");
    expect(stepFor("approved")).toBeNull();
    expect(actionsFor("am")).toEqual(["send_to_client", "approve_final", "request_changes"]);
    expect(actionsFor("pm")).toEqual(["approve", "request_changes"]);
  });
  it("open states and notes", () => {
    expect(isOpen("client_review")).toBe(true);
    expect(isOpen("changes_requested")).toBe(false);
    expect(actionNeedsNote("request_changes")).toBe(true);
    expect(actionNeedsNote("approve_final")).toBe(true);
    expect(actionNeedsNote("approve")).toBe(false);
    expect(stageLabel("client_review")).toBe("With client");
  });
});

describe("staffActedAs", () => {
  it("assigned PM (case-insensitive email) acts as assigned", () => {
    expect(staffActedAs("pm", { email: "PAT@marketfoundry.agency ", role: "editor" }, approvers, "sam@x.com")).toBe("assigned");
  });
  it("the AM may override the PM step (client team ladder, ruled 2026-10-02)", () => {
    expect(staffActedAs("pm", { email: "ann@marketfoundry.agency", role: "admin" }, approvers, "sam@x.com")).toBe("override");
  });
  it("owner / super_admin act as override", () => {
    expect(staffActedAs("am", { email: "boss@x.com", role: "owner" }, approvers, "sam@x.com")).toBe("override");
    expect(staffActedAs("am", { email: "boss@x.com", role: "super_admin" }, approvers, "sam@x.com")).toBe("override");
  });
  it("the author is blocked even as assigned PM or as owner (Review Focus 2 sibling)", () => {
    expect(staffActedAs("pm", { email: "pat@marketfoundry.agency", role: "editor" }, approvers, "Pat@MarketFoundry.agency")).toBeNull();
    expect(staffActedAs("pm", { email: "boss@x.com", role: "owner" }, approvers, "boss@x.com")).toBeNull();
  });
  it("unmatched approver (email null) → only override can act (Review Focus 2)", () => {
    const unmatched = { pm: { name: "Pat Typo", email: null }, am: null };
    expect(staffActedAs("pm", { email: "pat@marketfoundry.agency", role: "editor" }, unmatched, "sam@x.com")).toBeNull();
    expect(staffActedAs("pm", { email: "boss@x.com", role: "owner" }, unmatched, "sam@x.com")).toBe("override");
  });
});

import { overrideRole } from "./revision-rules";

describe("override by a higher level on the client team", () => {
  const team = { pm: { name: "Pat", email: "pat@x.com" }, am: { name: "Ann", email: "ann@x.com" }, es: { name: "Eve", email: "eve@x.com" } };
  it("PM step: the AM or the ES may override; AM step: only the ES", () => {
    expect(staffActedAs("pm", { email: "ann@x.com", role: "editor" }, team, "sam@x.com")).toBe("override");
    expect(staffActedAs("pm", { email: "eve@x.com", role: "editor" }, team, "sam@x.com")).toBe("override");
    expect(staffActedAs("am", { email: "eve@x.com", role: "editor" }, team, "sam@x.com")).toBe("override");
    expect(staffActedAs("am", { email: "pat@x.com", role: "editor" }, team, "sam@x.com")).toBeNull();
  });
  it("emergency: a submitter who is the client's AM or ES may approve their own revision (ruled 2026-10-02)", () => {
    // AM wrote it: overrides the PM step, approves the AM step as assigned
    expect(staffActedAs("pm", { email: "ann@x.com", role: "editor" }, team, "ann@x.com")).toBe("override");
    expect(staffActedAs("am", { email: "ann@x.com", role: "editor" }, team, "ann@x.com")).toBe("assigned");
    // ES wrote it: overrides both steps
    expect(staffActedAs("pm", { email: "eve@x.com", role: "editor" }, team, "eve@x.com")).toBe("override");
    expect(staffActedAs("am", { email: "eve@x.com", role: "editor" }, team, "eve@x.com")).toBe("override");
  });
  it("from PM downwards (and Owners not on the client team) self-approval is never allowed", () => {
    expect(staffActedAs("pm", { email: "pat@x.com", role: "editor" }, team, "pat@x.com")).toBeNull();
    expect(staffActedAs("am", { email: "pat@x.com", role: "owner" }, team, "pat@x.com")).toBeNull();
    expect(staffActedAs("pm", { email: "seo@x.com", role: "owner" }, team, "seo@x.com")).toBeNull();
  });
  it("overrideRole names who the override is as", () => {
    expect(overrideRole("pm", { email: "ann@x.com", role: "editor" }, team)).toBe("Account Manager");
    expect(overrideRole("am", { email: "eve@x.com", role: "editor" }, team)).toBe("Executive Strategist");
    expect(overrideRole("pm", { email: "boss@x.com", role: "owner" }, team)).toBe("Owner");
    expect(overrideRole("pm", { email: "pat@x.com", role: "editor" }, team)).toBeNull();
  });
});
