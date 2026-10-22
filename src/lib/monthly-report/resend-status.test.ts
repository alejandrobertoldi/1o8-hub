import { describe, it, expect } from "vitest";
import { normalizeResendLastEvent, deliveryFromResend } from "./resend-status";

describe("normalizeResendLastEvent", () => {
  it("maps Resend events to a short delivery label", () => {
    expect(normalizeResendLastEvent("delivered")).toBe("delivered");
    expect(normalizeResendLastEvent("opened")).toBe("delivered");
    expect(normalizeResendLastEvent("bounced")).toBe("bounced");
    expect(normalizeResendLastEvent("sent")).toBe("sent");
    expect(normalizeResendLastEvent("failed")).toBe("failed");
  });
});

describe("deliveryFromResend", () => {
  it("falls back to the stored send when Resend has no id", async () => {
    const row = await deliveryFromResend({
      resendEmailId: null,
      sentAt: "2026-08-27T19:08:02.000Z",
      sentTo: ["jake@gaffersportfishing.com"],
    });
    expect(row).toEqual({
      at: "2026-08-27T19:08:02.000Z",
      status: "sent",
      to: ["jake@gaffersportfishing.com"],
      resendId: null,
    });
  });

  it("marks a failed row", async () => {
    const row = await deliveryFromResend({
      resendEmailId: null,
      sentAt: null,
      sentTo: [],
      failed: true,
    });
    expect(row?.status).toBe("failed");
  });
});
