import { describe, expect, it, vi, beforeEach } from "vitest";
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/onboarding/create-asana-project", () => ({ asanaFetch: fetchMock }));
import { findParentByName, findSubtask, MR_ASANA } from "./asana";

const NAME = "1o8 | Monthly Reports | Oct 2026";
beforeEach(() => { fetchMock.mockReset(); });

describe("findParentByName", () => {
  it("pages through the section with offset and returns the open exact-name match", async () => {
    fetchMock
      .mockResolvedValueOnce({ data: [{ gid: "1", name: "Other", completed: false, permalink_url: "u1" }], next_page: { offset: "abc" } })
      .mockResolvedValueOnce({
        data: [
          { gid: "2", name: NAME, completed: true, permalink_url: "u2" },
          { gid: "3", name: `${NAME} (copy)`, completed: false, permalink_url: "u3" },
          { gid: "4", name: NAME, completed: false, permalink_url: "u4" },
        ],
        next_page: null,
      });
    await expect(findParentByName(NAME)).resolves.toEqual({ gid: "4", url: "u4" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(first).toContain(`/sections/${MR_ASANA.section}/tasks?`);
    expect(first).toContain("opt_fields=name,completed,permalink_url");
    expect(first).not.toContain("offset=");
    expect(second).toContain("offset=abc");
  });
  it("returns null when only completed or differently named tasks exist", async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ gid: "2", name: NAME, completed: true, permalink_url: "u2" }], next_page: null });
    await expect(findParentByName(NAME)).resolves.toBeNull();
  });
  it("propagates an Asana error (the caller decides)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Asana API 500: x"));
    await expect(findParentByName(NAME)).rejects.toThrow("Asana API 500");
  });
});

describe("findSubtask", () => {
  const SUB = "1o8 | Monthly Reports | PM Review — Hamid Zeb";
  it("matches exact name and case-insensitive assignee email", async () => {
    fetchMock.mockResolvedValueOnce({
      data: [
        { gid: "a", name: SUB, assignee: null, permalink_url: "ua" },
        { gid: "b", name: SUB, assignee: { email: "someone@marketfoundry.agency" }, permalink_url: "ub" },
        { gid: "c", name: SUB, assignee: { email: "Hamid@MarketFoundry.agency" }, permalink_url: "uc" },
      ],
      next_page: null,
    });
    await expect(findSubtask("P1", SUB, "hamid@marketfoundry.agency")).resolves.toEqual({ gid: "c", url: "uc" });
    const path = fetchMock.mock.calls[0][0] as string;
    expect(path).toContain("/tasks/P1/subtasks?");
    expect(path).toContain("opt_fields=name,assignee.email,permalink_url");
  });
  it("returns null when no subtask matches", async () => {
    fetchMock.mockResolvedValueOnce({ data: [{ gid: "a", name: "x", assignee: { email: "hamid@marketfoundry.agency" }, permalink_url: "ua" }], next_page: null });
    await expect(findSubtask("P1", SUB, "hamid@marketfoundry.agency")).resolves.toBeNull();
  });
});
