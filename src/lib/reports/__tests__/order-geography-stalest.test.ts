import { describe, it, expect } from "vitest";
import { pickStalestAccounts } from "../order-geography-stalest";

const NOW = new Date("2026-09-24T11:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("pickStalestAccounts", () => {
  it("puts never-snapshotted accounts first, then the oldest snapshots", () => {
    const refreshed = new Map([
      ["a", hoursAgo(30)],
      ["b", hoursAgo(50)],
    ]);
    expect(pickStalestAccounts(["a", "b", "c"], refreshed, NOW, 3)).toEqual(["c", "b", "a"]);
  });

  it("returns at most `limit` accounts", () => {
    const refreshed = new Map([
      ["a", hoursAgo(30)],
      ["b", hoursAgo(50)],
      ["c", hoursAgo(40)],
    ]);
    expect(pickStalestAccounts(["a", "b", "c"], refreshed, NOW, 2)).toEqual(["b", "c"]);
  });

  it("skips accounts already refreshed since 11:00 UTC today, so retry runs only pick up today's failures", () => {
    const at1300 = new Date("2026-09-24T13:20:00Z");
    const refreshed = new Map([
      ["done", new Date("2026-09-24T11:22:00Z")],
      ["failed", new Date("2026-09-23T12:54:00Z")],
    ]);
    expect(pickStalestAccounts(["done", "failed"], refreshed, at1300, 2)).toEqual(["failed"]);
    expect(pickStalestAccounts(["done"], refreshed, at1300, 2)).toEqual([]);
  });

  it("treats yesterday's late retry as due at 11:00, so accounts don't drift off the daily cycle", () => {
    const at1100 = new Date("2026-09-24T11:00:00Z");
    const refreshed = new Map([["late", new Date("2026-09-23T19:20:00Z")]]);
    expect(pickStalestAccounts(["late"], refreshed, at1100, 2)).toEqual(["late"]);
  });

  it("before 11:00 UTC, counts anything since yesterday's 11:00 as done", () => {
    const at0900 = new Date("2026-09-24T09:00:00Z");
    const refreshed = new Map([
      ["yesterday", new Date("2026-09-23T12:00:00Z")],
      ["older", new Date("2026-09-23T10:00:00Z")],
    ]);
    expect(pickStalestAccounts(["yesterday", "older"], refreshed, at0900, 2)).toEqual(["older"]);
  });

  it("breaks ties by account id so the order is stable", () => {
    expect(pickStalestAccounts(["z", "y"], new Map(), NOW, 2)).toEqual(["y", "z"]);
  });
});
