import { describe, it, expect, beforeAll } from "vitest";
import { signReportToken, verifyReportToken } from "./pdf-token";

describe("pdf-token", () => {
  beforeAll(() => {
    process.env.MONTHLY_REPORT_JWT_SECRET = "test-secret";
  });

  it("round-trips a report payload", () => {
    const payload = { foo: "bar", n: 42 };
    const token = signReportToken(payload);
    const decoded = verifyReportToken<typeof payload>(token);
    expect(decoded.foo).toBe("bar");
    expect(decoded.n).toBe(42);
  });

  it("rejects an invalid token", () => {
    expect(() => verifyReportToken("not.a.token")).toThrow();
  });

  it("rejects when secret is missing", () => {
    const token = signReportToken({ foo: "bar" });
    const orig = process.env.MONTHLY_REPORT_JWT_SECRET;
    delete process.env.MONTHLY_REPORT_JWT_SECRET;
    try {
      expect(() => verifyReportToken(token)).toThrow(/secret/i);
    } finally {
      process.env.MONTHLY_REPORT_JWT_SECRET = orig;
    }
  });
});
