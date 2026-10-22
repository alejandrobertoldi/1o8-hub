import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { getEffectiveAccountId, requireAuthOrCron } from "./api-auth";

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/reports/overview", { headers });
}

describe("requireAuthOrCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("returns null when cron headers are valid (no session check)", async () => {
    const result = await requireAuthOrCron(
      makeReq({
        "x-cron-refresh": "true",
        authorization: "Bearer test-cron-secret",
      }),
    );
    expect(result).toBeNull();
    expect(getAuthSession).not.toHaveBeenCalled();
  });

  it("falls back to session check when x-cron-refresh missing", async () => {
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const result = await requireAuthOrCron(makeReq());
    expect(result).toBeNull();
    expect(getAuthSession).toHaveBeenCalled();
  });

  it("returns 401 when no cron headers and no session", async () => {
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await requireAuthOrCron(makeReq());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when cron header is set but bearer is wrong", async () => {
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await requireAuthOrCron(
      makeReq({
        "x-cron-refresh": "true",
        authorization: "Bearer wrong-secret",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET env is unset, even with valid headers", async () => {
    delete process.env.CRON_SECRET;
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await requireAuthOrCron(
      makeReq({
        "x-cron-refresh": "true",
        authorization: "Bearer anything",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

function makeReportsReq(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/reports/product-performance");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function mockAacRows(rows: { clientIdCode: string; rawData: Record<string, string> }[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  });
}

describe("getEffectiveAccountId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("lets a multi-client user query HAL's accountId instead of the first assigned TRT", async () => {
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { role: "client", clientIdCode: "TRT_SC_US,HAL_SC_US" },
    });
    mockAacRows([
      { clientIdCode: "TRT_SC_US", rawData: { IntentwiseID: "trt-iw" } },
      { clientIdCode: "HAL_SC_US", rawData: { IntentwiseID: "hal-iw" } },
    ]);

    const id = await getEffectiveAccountId(makeReportsReq({ accountId: "hal-iw" }));
    expect(id).toBe("hal-iw");
  });

  it("honors ?client=HAL_SC_US when that code is assigned", async () => {
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { role: "client", clientIdCode: "TRT_SC_US,HAL_SC_US" },
    });
    mockAacRows([
      { clientIdCode: "HAL_SC_US", rawData: { IntentwiseID: "hal-iw" } },
    ]);

    const id = await getEffectiveAccountId(makeReportsReq({ client: "HAL_SC_US" }));
    expect(id).toBe("hal-iw");
  });

  it("rejects an accountId that is not in the assignment", async () => {
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { role: "client", clientIdCode: "TRT_SC_US,HAL_SC_US" },
    });
    mockAacRows([
      { clientIdCode: "TRT_SC_US", rawData: { IntentwiseID: "trt-iw" } },
      { clientIdCode: "HAL_SC_US", rawData: { IntentwiseID: "hal-iw" } },
    ]);

    const id = await getEffectiveAccountId(makeReportsReq({ accountId: "someone-else" }));
    expect(id).toBeNull();
  });

  it("falls back to the first assigned client when no client or accountId is passed", async () => {
    (getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { role: "client", clientIdCode: "TRT_SC_US,HAL_SC_US" },
    });
    mockAacRows([
      { clientIdCode: "TRT_SC_US", rawData: { IntentwiseID: "trt-iw" } },
      { clientIdCode: "HAL_SC_US", rawData: { IntentwiseID: "hal-iw" } },
    ]);

    const id = await getEffectiveAccountId(makeReportsReq());
    expect(id).toBe("trt-iw");
  });
});
