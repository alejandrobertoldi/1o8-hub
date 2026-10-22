import { describe, expect, it, vi, afterEach } from "vitest";
import {
  escapeHtml,
  buildTimeOffRequestEmail,
  buildTimeOffDecisionEmail,
  resolvedFromAddress,
  MONTHLY_REPORT_REPLY_TO,
  MONTHLY_REPORT_STAFF_FROM,
  MONTHLY_REPORT_CLIENT_FROM,
} from "./email";

describe("resolvedFromAddress", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the explicit from argument first", () => {
    expect(resolvedFromAddress("Reports <reports@marketfoundry.agency>"))
      .toBe("Reports <reports@marketfoundry.agency>");
  });

  it("falls back to RESEND_FROM_EMAIL then the 1o8 default", () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    expect(resolvedFromAddress()).toBe("1o8 <reports@marketfoundry.agency>");
    vi.stubEnv("RESEND_FROM_EMAIL", "Hub <hello@marketfoundry.agency>");
    expect(resolvedFromAddress()).toBe("Hub <hello@marketfoundry.agency>");
  });
});

describe("MONTHLY_REPORT_REPLY_TO", () => {
  it("is the shared reports inbox for internal staff pings only", () => {
    expect(MONTHLY_REPORT_REPLY_TO).toBe("reports@marketfoundry.agency");
  });
});

describe("MONTHLY_REPORT_STAFF_FROM", () => {
  it("sends PM/AM/CEO pings from the verified reports inbox", () => {
    expect(MONTHLY_REPORT_STAFF_FROM).toBe("1o8 Hub <reports@marketfoundry.agency>");
  });
});

describe("MONTHLY_REPORT_CLIENT_FROM", () => {
  it("sends client letters from the verified reports inbox", () => {
    expect(MONTHLY_REPORT_CLIENT_FROM).toBe("1o8 <reports@marketfoundry.agency>");
  });
});

describe("escapeHtml", () => {
  it("escapes all five dangerous characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Family trip to Madrid")).toBe("Family trip to Madrid");
  });

  it("escapes ampersands before angle brackets, not after", () => {
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });
});

describe("buildTimeOffRequestEmail", () => {
  const base = {
    requesterName: "Babar Ahmad",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    workingDays: 5,
    reason: "Family wedding",
  };

  it("names the requester in the subject", () => {
    expect(buildTimeOffRequestEmail(base).subject).toContain("Babar Ahmad");
  });

  it("includes the dates and the working-day count", () => {
    const { html } = buildTimeOffRequestEmail(base);
    expect(html).toContain("2026-08-10");
    expect(html).toContain("2026-08-14");
    // NOT toContain("5") — the template's own style values (#565454, #252525,
    // 0.5px) contain that digit, so the bare assertion would never fail.
    expect(html).toContain("5 working days");
  });

  it("uses the singular day label for a one-day request", () => {
    const { html } = buildTimeOffRequestEmail({ ...base, workingDays: 1 });
    expect(html).toContain("1 working day");
    expect(html).not.toContain("1 working days");
  });

  it("escapes HTML in the reason", () => {
    const { html } = buildTimeOffRequestEmail({
      ...base,
      reason: `<script>alert('x')</script>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in the requester name", () => {
    const { html } = buildTimeOffRequestEmail({
      ...base,
      requesterName: "<img src=x onerror=1>",
    });
    expect(html).not.toContain("<img");
  });

  it("links to the review queue", () => {
    expect(buildTimeOffRequestEmail(base).html).toContain("/calendar/requests");
  });
});

describe("buildTimeOffDecisionEmail", () => {
  const base = {
    status: "approved" as const,
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    workingDays: 5,
    decisionNote: null,
  };

  it("says approved in the subject when approved", () => {
    expect(buildTimeOffDecisionEmail(base).subject).toMatch(/approved/i);
  });

  it("says denied in the subject when denied", () => {
    const email = buildTimeOffDecisionEmail({ ...base, status: "denied" });
    expect(email.subject).toMatch(/denied/i);
  });

  it("omits the note block when there is no note", () => {
    expect(buildTimeOffDecisionEmail(base).html).not.toContain("Note from");
  });

  it("includes and escapes the note when present", () => {
    const { html } = buildTimeOffDecisionEmail({
      ...base,
      decisionNote: "<b>enjoy</b>",
    });
    expect(html).toContain("Note from");
    expect(html).toContain("&lt;b&gt;enjoy&lt;/b&gt;");
    expect(html).not.toContain("<b>enjoy</b>");
  });

  it("says revoked in the subject when cancelled", () => {
    const email = buildTimeOffDecisionEmail({ ...base, status: "cancelled" });
    expect(email.subject).toMatch(/revoked/i);
    expect(email.subject).not.toMatch(/denied/i);
  });

  it("labels a cancelled decision Revoked in the body", () => {
    const { html } = buildTimeOffDecisionEmail({ ...base, status: "cancelled" });
    expect(html).toContain("Time Off Revoked");
    expect(html).toContain("#FF5C5F");
  });

  // email.ts:330 hardcoded "Note from Jake", false since D2 was reversed to
  // two approvers on 2026-08-07.
  it("attributes the note to the approver rather than naming Jake", () => {
    const { html } = buildTimeOffDecisionEmail({
      ...base,
      decisionNote: "Enjoy the trip",
    });
    expect(html).toMatch(/note from your approver/i);
    expect(html).not.toMatch(/jake/i);
  });
});
