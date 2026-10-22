import { describe, expect, it } from "vitest";
import { parseGenerateHttpBody } from "./parse-generate-response";

describe("parseGenerateHttpBody", () => {
  it("returns JSON errors from our API", () => {
    const result = parseGenerateHttpBody(500, JSON.stringify({ error: "Failed to launch" }));
    expect(result).toEqual({ ok: false, error: "Failed to launch" });
  });

  it("maps Vercel 504 timeouts to a retry message", () => {
    const result = parseGenerateHttpBody(504, "An error occurred with your deployment");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Timed out generating the PDF/);
  });

  it("maps Vercel plain-text 500 bodies instead of throwing SyntaxError", () => {
    const result = parseGenerateHttpBody(500, "An error occurred with your deployment");
    expect(result).toEqual({
      ok: false,
      error: "Server error while generating the PDF. Retry once.",
    });
  });

  it("parses a successful JSON body", () => {
    const result = parseGenerateHttpBody(200, JSON.stringify({ driveUrl: "https://drive.google.com/x" }));
    expect(result).toEqual({ ok: true, body: { driveUrl: "https://drive.google.com/x" } });
  });
});
