import { describe, it, expect } from "vitest";
import type { Report } from "@/components/monthly-report/types";
import {
  MAX_SECTION_COMMENT_CHARS,
  applySectionComment,
  commentsFromUnknown,
  preserveSectionComments,
} from "./section-comments";
import { canComment, commenterRole } from "./review";

const base: Report = {
  meta: {
    client: "ReadyRESCUE",
    month: "July 2026",
    period: "01 Jul – 31 Jul",
    lead: "Alex Moreno",
    issued: "Aug 04",
    reportId: "x",
  },
  sections: ["cover", "kpis", "mom"],
};

describe("applySectionComment", () => {
  it("writes a trimmed note onto the section", () => {
    const result = applySectionComment(base, {
      sectionId: "kpis",
      text: "  Sessions dipped on Prime Day.  ",
      authorName: "Sara Khan",
      role: "pm",
      updatedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.sectionComments?.kpis).toEqual({
      text: "Sessions dipped on Prime Day.",
      authorName: "Sara Khan",
      role: "pm",
      updatedAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("clears the section when the text is empty", () => {
    const withNote = applySectionComment(base, {
      sectionId: "kpis",
      text: "Keep this",
      authorName: "Sara Khan",
      role: "pm",
      updatedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(withNote.ok).toBe(true);
    if (!withNote.ok) return;
    const cleared = applySectionComment(withNote.report, {
      sectionId: "kpis",
      text: "   ",
      authorName: "Alex Moreno",
      role: "am",
      updatedAt: "2026-09-01T11:00:00.000Z",
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.report.sectionComments?.kpis).toBeUndefined();
  });

  it("rejects cover, toc, and unknown sections", () => {
    expect(applySectionComment(base, {
      sectionId: "cover",
      text: "Hi",
      authorName: "Sara",
      role: "pm",
      updatedAt: "2026-09-01T10:00:00.000Z",
    }).ok).toBe(false);
    expect(applySectionComment(base, {
      sectionId: "not-a-section",
      text: "Hi",
      authorName: "Sara",
      role: "pm",
      updatedAt: "2026-09-01T10:00:00.000Z",
    }).ok).toBe(false);
  });

  it("caps length", () => {
    const result = applySectionComment(base, {
      sectionId: "mom",
      text: "x".repeat(MAX_SECTION_COMMENT_CHARS + 20),
      authorName: "Jake",
      role: "ceo",
      updatedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.sectionComments?.mom?.text).toHaveLength(MAX_SECTION_COMMENT_CHARS);
  });
});

describe("preserveSectionComments", () => {
  it("copies prior notes onto a regenerated report", () => {
    const previous: Report = {
      ...base,
      sectionComments: {
        kpis: {
          text: "Ad spend was pulled back on purpose.",
          authorName: "Alex Moreno",
          role: "am",
          updatedAt: "2026-08-20T12:00:00.000Z",
        },
      },
    };
    const next = preserveSectionComments({ ...base, kpis: [] }, previous);
    expect(next.sectionComments?.kpis?.text).toBe("Ad spend was pulled back on purpose.");
  });

  it("ignores junk previous JSON", () => {
    expect(preserveSectionComments(base, null).sectionComments).toBeUndefined();
    expect(commentsFromUnknown({ sectionComments: { kpis: { text: 1 } } })).toEqual({});
  });
});

describe("commenterRole / canComment", () => {
  it("allows AM, CEO, and admin override, but not the PM", () => {
    expect(canComment({ pm: true, am: false, jake: false, override: false })).toBe(false);
    expect(canComment({ pm: false, am: true, jake: false, override: false })).toBe(true);
    expect(canComment({ pm: false, am: false, jake: true, override: false })).toBe(true);
    expect(canComment({ pm: false, am: false, jake: false, override: true })).toBe(true);
    expect(canComment({ pm: false, am: false, jake: false, override: false })).toBe(false);
  });

  it("prefers CEO, then AM, then admin; never labels a note PM", () => {
    expect(commenterRole({ pm: true, am: true, jake: true, override: true })).toBe("ceo");
    expect(commenterRole({ pm: true, am: true, jake: false, override: true })).toBe("am");
    expect(commenterRole({ pm: true, am: false, jake: false, override: true })).toBe("admin");
    expect(commenterRole({ pm: true, am: false, jake: false, override: false })).toBeNull();
    expect(commenterRole({ pm: false, am: false, jake: false, override: true })).toBe("admin");
    expect(commenterRole({ pm: false, am: false, jake: false, override: false })).toBeNull();
  });
});
