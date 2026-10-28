import { describe, expect, it } from "vitest";
import {
  canSubmitTimeOff,
  canApproveTimeOff,
  canDecideTimeOff,
  findConflict,
  canCancel,
  canRevoke,
  todayInZone,
} from "./guards";

describe("canSubmitTimeOff", () => {
  it("allows owner", () => expect(canSubmitTimeOff("owner")).toBe(true));
  it("allows super_admin", () => expect(canSubmitTimeOff("super_admin")).toBe(true));
  it("allows admin", () => expect(canSubmitTimeOff("admin")).toBe(true));
  it("allows editor", () => expect(canSubmitTimeOff("editor")).toBe(true));
  it("rejects viewer", () => expect(canSubmitTimeOff("viewer")).toBe(false));
  it("rejects client", () => expect(canSubmitTimeOff("client")).toBe(false));
  it("rejects pending", () => expect(canSubmitTimeOff("pending")).toBe(false));
  it("rejects an unknown role", () => expect(canSubmitTimeOff("robot")).toBe(false));
});

// 1o8: approvers are admins and above. A person's assigned approver decides
// their requests (owners / super admins as backup); unassigned: any admin.
describe("canApproveTimeOff / canDecideTimeOff", () => {
  const admin = { id: "a1", role: "admin" };
  it("lets admins and above approve", () => {
    expect(canApproveTimeOff("owner")).toBe(true);
    expect(canApproveTimeOff("super_admin")).toBe(true);
    expect(canApproveTimeOff("admin")).toBe(true);
    expect(canApproveTimeOff("editor")).toBe(false);
    expect(canApproveTimeOff(undefined)).toBe(false);
  });
  it("any admin decides when nobody is assigned", () => expect(canDecideTimeOff(admin, null)).toBe(true));
  it("the assigned approver decides", () => expect(canDecideTimeOff(admin, "a1")).toBe(true));
  it("another admin can't decide someone else's assignee", () => expect(canDecideTimeOff(admin, "a2")).toBe(false));
  it("owners and super admins are the backup", () => {
    expect(canDecideTimeOff({ id: "o1", role: "owner" }, "a2")).toBe(true);
    expect(canDecideTimeOff({ id: "s1", role: "super_admin" }, "a2")).toBe(true);
  });
  it("editors never decide, even when assigned", () => expect(canDecideTimeOff({ id: "e1", role: "editor" }, "e1")).toBe(false));
});

describe("findConflict", () => {
  const existing = [
    { id: "a", startDate: "2026-08-10", endDate: "2026-08-14" },
    { id: "b", startDate: "2026-09-01", endDate: "2026-09-02" },
  ];

  it("returns null when nothing overlaps", () => {
    expect(findConflict("2026-08-17", "2026-08-21", existing)).toBeNull();
  });

  it("finds the overlapping row", () => {
    expect(findConflict("2026-08-12", "2026-08-18", existing)?.id).toBe("a");
  });

  it("treats a shared boundary day as a conflict", () => {
    expect(findConflict("2026-08-14", "2026-08-20", existing)?.id).toBe("a");
  });

  it("returns null against an empty list", () => {
    expect(findConflict("2026-08-12", "2026-08-18", [])).toBeNull();
  });

  // All three positive cases above resolve to row "a", the first element —
  // an implementation that only ever examined existing[0] would still pass
  // them. This proves the loop actually reaches a later element.
  it("finds an overlap on a row past the first element", () => {
    expect(findConflict("2026-09-02", "2026-09-05", existing)?.id).toBe("b");
  });
});

describe("canCancel", () => {
  const TODAY = "2026-08-03";

  it("allows cancelling a pending request", () => {
    expect(canCancel("pending", "2026-07-01", TODAY)).toBe(true);
  });

  it("allows cancelling an approved future request", () => {
    expect(canCancel("approved", "2026-08-10", TODAY)).toBe(true);
  });

  it("rejects cancelling an approved request already started", () => {
    expect(canCancel("approved", "2026-08-03", TODAY)).toBe(false);
  });

  it("rejects cancelling an approved past request", () => {
    expect(canCancel("approved", "2026-07-01", TODAY)).toBe(false);
  });

  it("rejects cancelling a denied request", () => {
    expect(canCancel("denied", "2026-09-01", TODAY)).toBe(false);
  });

  it("rejects cancelling an already-cancelled request", () => {
    expect(canCancel("cancelled", "2026-09-01", TODAY)).toBe(false);
  });
});

describe("canRevoke", () => {
  it("allows revoking an approved request", () => {
    expect(canRevoke("approved")).toBe(true);
  });

  // Deliberately date-free: an approver may revoke approved leave whether it
  // starts tomorrow, is in progress, or finished last month (ruling R4). This
  // pins the signature — adding a date parameter would fail here.
  it("takes only a status, so it cannot depend on dates", () => {
    expect(canRevoke.length).toBe(1);
  });

  it("rejects revoking a pending request", () => {
    // Pending already has Deny, which sends its own decision email.
    expect(canRevoke("pending")).toBe(false);
  });

  it("rejects revoking a denied request", () => {
    expect(canRevoke("denied")).toBe(false);
  });

  it("rejects revoking an already-cancelled request", () => {
    expect(canRevoke("cancelled")).toBe(false);
  });
});

// Ruling P3: "today" must be the requester's own today, never UTC. `now` is
// injected so this is pure and the boundary cases are actually testable.
// Keyed on the stored IANA zone from `users.residence_timezone` — there is no
// country→zone map any more, which is the point of the split.
describe("todayInZone", () => {
  it("rolls Karachi into the next day before UTC does", () => {
    // 21:00Z is 02:00 the NEXT day in Karachi (UTC+5, no DST). This is the
    // exact case that let a PK user cancel leave that had already started.
    expect(todayInZone("Asia/Karachi", new Date("2026-08-03T21:00:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("rolls Madrid into the next day before UTC does", () => {
    // 23:30Z is 01:30 the next day in Madrid (CEST, UTC+2, in August).
    expect(todayInZone("Europe/Madrid", new Date("2026-08-03T23:30:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("keeps New York on the previous day after UTC midnight", () => {
    // 02:00Z is 22:00 the PREVIOUS day in New York (EDT, UTC-4, in August).
    expect(
      todayInZone("America/New_York", new Date("2026-08-04T02:00:00Z"))
    ).toBe("2026-08-03");
  });

  it("falls back to UTC when the zone is null", () => {
    expect(todayInZone(null, new Date("2026-08-04T02:00:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("falls back to UTC for a string that is not a zone at all", () => {
    expect(todayInZone("UK", new Date("2026-08-04T02:00:00Z"))).toBe(
      "2026-08-04"
    );
  });

  // NEW. `Intl.DateTimeFormat` THROWS RangeError on this exact string
  // (verified on Node v24.13.1). One person's typo in the admin UI must not
  // break the cancel button for everyone, so this must return a date rather
  // than propagate.
  it("falls back to UTC for a typo'd zone instead of throwing", () => {
    expect(() =>
      todayInZone("America/Los_Angles", new Date("2026-08-04T02:00:00Z"))
    ).not.toThrow();
    expect(
      todayInZone("America/Los_Angles", new Date("2026-08-04T02:00:00Z"))
    ).toBe("2026-08-04");
  });

  // NEW. Falsy-but-not-null takes the fallback branch, not the try/catch —
  // a cleared field that round-trips as "" rather than NULL.
  it("falls back to UTC for an empty string", () => {
    expect(todayInZone("", new Date("2026-08-04T02:00:00Z"))).toBe("2026-08-04");
  });

  // NEW, AND THE POINT OF THE WHOLE CHANGE. The old one-zone-per-country map
  // (US → America/New_York) could not express this: at this single instant a
  // New Yorker and a Californian are on DIFFERENT dates, so under the old
  // code a Pacific-coast user's approved request stopped being cancellable
  // ~3h before their own midnight.
  it("distinguishes Pacific from Eastern at the same instant", () => {
    const instant = new Date("2026-08-04T04:30:00Z");
    expect(todayInZone("America/Los_Angeles", instant)).toBe("2026-08-03");
    expect(todayInZone("America/New_York", instant)).toBe("2026-08-04");
  });

  // The cases above pin the SIGN of each offset; these bracket each zone
  // against its real-world neighbours, so a wrong (but same-sign) zone fails.

  it("pins Eastern, not Central or Pacific", () => {
    // 04:30Z is 00:30 Aug 4 in New York (EDT, UTC-4) but still 23:30 Aug 3
    // in Chicago (UTC-5) and Los Angeles (UTC-7).
    expect(
      todayInZone("America/New_York", new Date("2026-08-04T04:30:00Z"))
    ).toBe("2026-08-04");
  });

  it("pins Karachi, not Dhaka, on the early side of the boundary", () => {
    // 18:30Z is 23:30 Aug 3 in Karachi (UTC+5) but already 00:30 Aug 4 in
    // Dhaka (UTC+6).
    expect(todayInZone("Asia/Karachi", new Date("2026-08-03T18:30:00Z"))).toBe(
      "2026-08-03"
    );
  });

  it("pins Karachi, not Dubai, on the late side of the boundary", () => {
    // 19:30Z is 00:30 Aug 4 in Karachi (UTC+5) but still 23:30 Aug 3 in
    // Dubai (UTC+4). With the previous case this brackets UTC+5 exactly.
    expect(todayInZone("Asia/Karachi", new Date("2026-08-03T19:30:00Z"))).toBe(
      "2026-08-04"
    );
  });

  it("pins Madrid, not Karachi or Dubai, on the early side of the boundary", () => {
    // 21:30Z is 23:30 Aug 3 in Madrid (CEST, UTC+2) but already Aug 4 in both
    // Karachi (02:30) and Dubai (01:30).
    expect(todayInZone("Europe/Madrid", new Date("2026-08-03T21:30:00Z"))).toBe(
      "2026-08-03"
    );
  });

  it("pins Madrid, not London, on the late side of the boundary", () => {
    // 22:30Z is 00:30 Aug 4 in Madrid (CEST, UTC+2) but still 23:30 Aug 3 in
    // London (BST, UTC+1). With the previous case this brackets UTC+2 exactly.
    expect(todayInZone("Europe/Madrid", new Date("2026-08-03T22:30:00Z"))).toBe(
      "2026-08-04"
    );
  });
});
