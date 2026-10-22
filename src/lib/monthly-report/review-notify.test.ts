import { describe, it, expect } from "vitest";
import { buildStaffReviewEmail, buildPmDigestEmail, buildCeoDigestEmail, monthlyReviewHubUrl, staffNotifyKind } from "./review-notify";

describe("buildStaffReviewEmail", () => {
  it("asks the PM to review or regenerate after autogenerate", () => {
    const letter = buildStaffReviewEmail({
      role: "pm",
      clientName: "Gaffer",
      periodLabel: "July 2026",
      kind: "generated",
    });
    expect(letter.subject).toMatch(/Gaffer/);
    expect(letter.subject).toMatch(/PM review/i);
    expect(letter.html).toMatch(/regenerate/i);
    expect(letter.html).toContain(monthlyReviewHubUrl());
    expect(letter.html).not.toContain("<svg");
  });

  it("asks the AM to review after PM approval", () => {
    const letter = buildStaffReviewEmail({
      role: "am",
      clientName: "Gaffer",
      periodLabel: "July 2026",
      kind: "approve",
    });
    expect(letter.subject).toMatch(/AM review/i);
    expect(letter.html).toMatch(/add a client note/i);
    expect(letter.html).toMatch(/approve/i);
  });

  it("asks Jake to review after AM approval", () => {
    const letter = buildStaffReviewEmail({
      role: "jake",
      clientName: "Gaffer",
      periodLabel: "July 2026",
      kind: "approve",
    });
    expect(letter.subject).toMatch(/your review/i);
    expect(letter.html).toMatch(/sent to the client automatically/i);
  });

  it("treats Jake send-back as a send-back to the AM, not a new approval", () => {
    expect(staffNotifyKind("am_review", "jake_review")).toBe("send_back");
    expect(staffNotifyKind("generated", "am_review")).toBe("send_back");
    expect(staffNotifyKind("jake_review", "am_review")).toBe("approve");
  });

  it("escapes a send-back note", () => {
    const letter = buildStaffReviewEmail({
      role: "pm",
      clientName: "Gaffer",
      periodLabel: "July 2026",
      kind: "send_back",
      note: `<img src=x onerror=alert(1)>`,
    });
    expect(letter.html).toContain("&lt;img");
    expect(letter.html).not.toContain("<img src=x");
  });
});

describe("digest emails", () => {
  it("lists every PM client in one email", () => {
    const letter = buildPmDigestEmail({
      periodLabel: "August 2026",
      clients: ["Gaffer", "Hotshot US"],
    });
    expect(letter.subject).toBe("August 2026 monthly reports are ready for your review");
    expect(letter.html).toContain("Gaffer");
    expect(letter.html).toContain("Hotshot US");
    expect(letter.html).toContain(monthlyReviewHubUrl());
  });

  it("tells the CEO once that the queue is waiting and auto-sends on approve", () => {
    const letter = buildCeoDigestEmail({ periodLabel: "August 2026" });
    expect(letter.subject).toBe("August 2026 monthly reports are ready for CEO review");
    expect(letter.html).toMatch(/automatically/i);
    expect(letter.html).toMatch(/will not get another email/i);
  });
});
