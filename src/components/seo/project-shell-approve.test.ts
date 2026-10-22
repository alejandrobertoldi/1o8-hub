// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { markPhaseApproved, getProjectState, deriveCurrentPhase } from "./project-shell";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("records the approval and notifies the page in one call, so the next phase unlocks without a reload", () => {
  const events: string[] = [];
  const onUpdate = () => events.push("updated");
  window.addEventListener("project_state_updated", onUpdate);
  markPhaseApproved("p1", "s3");
  window.removeEventListener("project_state_updated", onUpdate);
  expect(getProjectState("p1").s3_approved_at).toBeTruthy();
  expect(events).toEqual(["updated"]);
  expect(deriveCurrentPhase(getProjectState("p1"))).toBe("S4");
});
