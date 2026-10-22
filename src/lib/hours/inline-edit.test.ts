import { describe, it, expect } from "vitest";
import {
  draftFromEntry,
  isDraftDirty,
  isDraftValid,
  applyDraftToRows,
  applyServerEntry,
  type ApiEntry,
} from "./inline-edit";

const entry: ApiEntry = {
  id: "e1",
  userId: "u1",
  clientIdCode: "INTERNAL",
  entryDate: "2026-07-22",
  startTime: "15:00",
  endTime: "15:30",
  hours: 0.5,
  note: "Checking emails",
  category: "Gmail",
};

describe("draftFromEntry", () => {
  it("seeds every editable field from the entry", () => {
    const d = draftFromEntry(entry);
    expect(d.clientIdCode).toBe("INTERNAL");
    expect(d.category).toBe("Gmail");
    expect(d.startTime).toBe("15:00");
    expect(d.endTime).toBe("15:30");
    expect(d.note).toBe("Checking emails");
    expect(d.status).toBe("editing");
    expect(d.error).toBeUndefined();
  });

  it("normalizes null note and category to empty strings", () => {
    const d = draftFromEntry({ ...entry, note: null, category: null });
    expect(d.note).toBe("");
    expect(d.category).toBe("");
  });

  it("keeps the original entry as the rollback snapshot", () => {
    expect(draftFromEntry(entry).snapshot).toEqual(entry);
  });
});

describe("isDraftDirty", () => {
  it("is false for an untouched draft", () => {
    expect(isDraftDirty(draftFromEntry(entry))).toBe(false);
  });

  it("is false when a null note is untouched (null vs empty string)", () => {
    expect(isDraftDirty(draftFromEntry({ ...entry, note: null }))).toBe(false);
  });

  it("detects a changed note", () => {
    expect(isDraftDirty({ ...draftFromEntry(entry), note: "Refining report" })).toBe(true);
  });

  it("detects a changed client, category, start and end", () => {
    const base = draftFromEntry(entry);
    expect(isDraftDirty({ ...base, clientIdCode: "DRC_SC_US" })).toBe(true);
    expect(isDraftDirty({ ...base, category: "Research" })).toBe(true);
    expect(isDraftDirty({ ...base, startTime: "14:00" })).toBe(true);
    expect(isDraftDirty({ ...base, endTime: "16:00" })).toBe(true);
  });

  it("treats a whitespace-only note change as clean", () => {
    expect(isDraftDirty({ ...draftFromEntry(entry), note: "  Checking emails  " })).toBe(false);
  });
});

describe("isDraftValid", () => {
  it("accepts a well-formed draft", () => {
    expect(isDraftValid(draftFromEntry(entry))).toEqual({ ok: true });
  });

  it("rejects a missing client with a user-facing reason", () => {
    const r = isDraftValid({ ...draftFromEntry(entry), clientIdCode: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Pick a client");
  });

  it("rejects a zero-length range", () => {
    const r = isDraftValid({ ...draftFromEntry(entry), startTime: "15:00", endTime: "15:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects a midnight-crossing range before it can reach the server", () => {
    const r = isDraftValid({ ...draftFromEntry(entry), startTime: "23:00", endTime: "01:00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/midnight/i);
  });
});

const other: ApiEntry = {
  id: "e2",
  userId: "u1",
  clientIdCode: "DRC_SC_US",
  entryDate: "2026-07-22",
  startTime: "16:30",
  endTime: "17:00",
  hours: 0.5,
  note: null,
  category: "Research",
};

describe("applyDraftToRows", () => {
  it("patches only the target row and recomputes hours locally", () => {
    const draft = { ...draftFromEntry(entry), startTime: "15:00", endTime: "17:00" };
    const out = applyDraftToRows([entry, other], "e1", draft);
    expect(out[0].startTime).toBe("15:00");
    expect(out[0].endTime).toBe("17:00");
    expect(out[0].hours).toBe(2);
    expect(out[1]).toEqual(other);
  });

  it("writes empty note and category back as null", () => {
    const draft = { ...draftFromEntry(entry), note: "", category: "" };
    const out = applyDraftToRows([entry], "e1", draft);
    expect(out[0].note).toBeNull();
    expect(out[0].category).toBeNull();
  });

  it("trims the note", () => {
    const draft = { ...draftFromEntry(entry), note: "  Refining report  " };
    expect(applyDraftToRows([entry], "e1", draft)[0].note).toBe("Refining report");
  });

  it("preserves row order and identity fields", () => {
    const out = applyDraftToRows([entry, other], "e1", draftFromEntry(entry));
    expect(out.map((r) => r.id)).toEqual(["e1", "e2"]);
    expect(out[0].userId).toBe("u1");
    expect(out[0].entryDate).toBe("2026-07-22");
  });

  it("leaves rows untouched when the id is absent", () => {
    const rows = [entry, other];
    expect(applyDraftToRows(rows, "nope", draftFromEntry(entry))).toEqual(rows);
  });

  it("keeps the previous hours when the draft range is invalid", () => {
    const draft = { ...draftFromEntry(entry), startTime: "23:00", endTime: "01:00" };
    const out = applyDraftToRows([entry], "e1", draft);
    expect(out[0].hours).toBe(0.5);
    expect(out[0].startTime).toBe("15:00");
    expect(out[0].endTime).toBe("15:30");
  });

  it("reassigns the row's client", () => {
    const draft = { ...draftFromEntry(entry), clientIdCode: "DRC_SC_US" };
    expect(applyDraftToRows([entry], "e1", draft)[0].clientIdCode).toBe("DRC_SC_US");
  });
});

describe("applyServerEntry", () => {
  it("replaces the matching row wholesale", () => {
    const fromServer: ApiEntry = { ...entry, startTime: "15:00", endTime: "16:00", hours: 1 };
    const out = applyServerEntry([entry, other], fromServer);
    expect(out[0]).toEqual(fromServer);
    expect(out[1]).toEqual(other);
  });

  it("is a no-op when the row is gone", () => {
    expect(applyServerEntry([other], entry)).toEqual([other]);
  });
});
