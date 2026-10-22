import { describe, expect, it } from "vitest";
import {
  isDoneProjectStatus,
  isInactiveProjectStatus,
  isPortalActiveStatus,
  isPortalCompletedStatus,
  isPortalProgressStatus,
  isProjectStatus,
  MANUAL_PROJECT_STATUSES,
  projectStatusLabel,
} from "./project-status";

describe("project-status", () => {
  it("accepts live and deprecated", () => {
    expect(isProjectStatus("live")).toBe(true);
    expect(isProjectStatus("deprecated")).toBe(true);
    expect(isProjectStatus("bogus")).toBe(false);
  });

  it("treats deprecated as inactive and live as done", () => {
    expect(isInactiveProjectStatus("deprecated")).toBe(true);
    expect(isInactiveProjectStatus("archived")).toBe(true);
    expect(isInactiveProjectStatus("live")).toBe(false);
    expect(isDoneProjectStatus("live")).toBe(true);
    expect(isDoneProjectStatus("completed")).toBe(true);
    expect(isDoneProjectStatus("draft")).toBe(false);
  });

  it("buckets portal active vs completed", () => {
    expect(isPortalActiveStatus("draft")).toBe(true);
    expect(isPortalActiveStatus("live")).toBe(true);
    expect(isPortalActiveStatus("deprecated")).toBe(false);
    expect(isPortalCompletedStatus("completed")).toBe(true);
    expect(isPortalCompletedStatus("deprecated")).toBe(true);
    expect(isPortalCompletedStatus("live")).toBe(false);
  });

  it("averages progress over open pipeline work only", () => {
    expect(isPortalProgressStatus("draft")).toBe(true);
    expect(isPortalProgressStatus("in_progress")).toBe(true);
    expect(isPortalProgressStatus("live")).toBe(false);
  });

  it("labels statuses for display", () => {
    expect(projectStatusLabel("in_progress")).toBe("in progress");
    expect(projectStatusLabel("live")).toBe("live");
  });
});

describe("MANUAL_PROJECT_STATUSES", () => {
  it("excludes the derived live/deprecated statuses", () => {
    expect(MANUAL_PROJECT_STATUSES).toEqual(["draft", "in_progress", "completed", "archived"]);
  });
});
