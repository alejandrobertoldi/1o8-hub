import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Mock gcp-auth before importing sheetsClient
vi.mock("@/lib/gcp-auth", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

import { sheetsClient } from "./sheets-client";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sheetsClient.createSpreadsheet", () => {
  it("POSTs to the spreadsheets endpoint with title and bearer token", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJson({ spreadsheetId: "sheet-123" })
    );

    const result = await sheetsClient.createSpreadsheet("My Template");

    expect(result).toEqual({ spreadsheetId: "sheet-123" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      properties: { title: "My Template" },
    });
  });

  it("throws on non-2xx response with error text", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("quota exceeded", { status: 429, statusText: "Too Many Requests" })
    );
    await expect(sheetsClient.createSpreadsheet("x")).rejects.toThrow(/429.*quota exceeded/);
  });
});

describe("sheetsClient.batchUpdate", () => {
  it("POSTs to :batchUpdate with requests array", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJson({ replies: [] }));
    await sheetsClient.batchUpdate("sheet-1", [{ addSheet: { properties: { title: "X" } } }]);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets/sheet-1:batchUpdate");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      requests: [{ addSheet: { properties: { title: "X" } } }],
    });
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }))
      .mockResolvedValueOnce(mockJson({ replies: [] }));
    const result = await sheetsClient.batchUpdate("sheet-1", []);
    expect(result).toEqual({ replies: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response("bad", { status: 400, statusText: "Bad Request" }));
    await expect(sheetsClient.batchUpdate("sheet-1", [])).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 400 when error body contains numeric 5xx-looking values", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response("Value exceeded limit of 500 characters", {
        status: 400,
        statusText: "Bad Request",
      })
    );
    await expect(sheetsClient.batchUpdate("sheet-1", [])).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sheetsClient.getValues", () => {
  it("GETs :batchGet with repeated ranges param", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJson({ valueRanges: [{ range: "A!A1:B2", values: [["a"]] }] })
    );
    const result = await sheetsClient.getValues("sheet-1", ["A!A1:B2", "B!A1:C3"]);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("ranges=A%21A1%3AB2");
    expect(url).toContain("ranges=B%21A1%3AC3");
    expect(result.valueRanges).toHaveLength(1);
  });
});

describe("sheetsClient.setValues", () => {
  it("PUTs values to /values/<range>?valueInputOption=RAW", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJson({ updatedRows: 1 }));
    await sheetsClient.setValues("sheet-1", "Sheet1!A1", [["hi"]]);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/values/Sheet1!A1");
    expect(url).toContain("valueInputOption=RAW");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ values: [["hi"]] });
  });

  it("URL-encodes range names containing special characters", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockJson({ updatedRows: 1 }));
    await sheetsClient.setValues("sheet-1", "Sheet & Co!A1:B2", [["x"]]);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/values/Sheet%20%26%20Co!A1%3AB2");
  });
});
