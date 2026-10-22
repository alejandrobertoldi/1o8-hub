// @vitest-environment node
//
// Regression test for the merchantID key-casing bug: onboarding's
// iw_get_merchant_id step used to write aac.raw_data["MerchantID"] (capital M)
// while the client summary page reads/writes the canonical "merchantID" key,
// so a merchant ID saved during onboarding never showed up on the summary
// page. This locks the write (and the BigQuery sync field name) to the
// canonical lowercase key.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

const mockUpdateAacFieldInBigQuery = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/bigquery", () => ({
  updateAacFieldInBigQuery: (...args: unknown[]) => mockUpdateAacFieldInBigQuery(...args),
}));

vi.mock("@/lib/onboarding/sync-gantt", () => ({
  syncGanttOnStepComplete: vi.fn(async () => {}),
}));

// syncAsanaCompletion is a no-op once STEP_TO_ASANA_TASK has no entry for the step.
vi.mock("@/lib/onboarding/create-asana-project", () => ({
  STEP_TO_ASANA_TASK: {},
  findAsanaTaskInProject: vi.fn(),
  updateAsanaTaskAssignee: vi.fn(),
  setAsanaTaskCompleted: vi.fn(),
  updateAsanaTask: vi.fn(),
  asanaFetch: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/clients/[clientIdCode]/onboarding/[stepKey] — iw_get_merchant_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function request(merchantId: string): Request {
    return new Request("http://localhost/api/clients/TEST_CLIENT/onboarding/iw_get_merchant_id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId }),
    });
  }

  function params() {
    return { params: Promise.resolve({ clientIdCode: "TEST_CLIENT", stepKey: "iw_get_merchant_id" }) };
  }

  it("writes the canonical lowercase merchantID key, not MerchantID", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ rawData: { ClientStatus: "Active" } }]),
        }),
      }),
    });

    let capturedSet: Record<string, unknown> | undefined;
    mockUpdate.mockReturnValue({
      set: (setArg: Record<string, unknown>) => ({
        where: () => {
          capturedSet = setArg;
          return Promise.resolve();
        },
      }),
    });

    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    });

    // @ts-expect-error minimal Next.js route context for the test
    const res = await POST(request("A1B2C3D4E5F6G7"), params());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, status: "completed", merchantId: "A1B2C3D4E5F6G7" });

    const writtenRawData = capturedSet?.rawData as Record<string, string>;
    expect(writtenRawData.merchantID).toBe("A1B2C3D4E5F6G7");
    expect(writtenRawData).not.toHaveProperty("MerchantID");

    // BigQuery sync must target the same canonical column name.
    expect(mockUpdateAacFieldInBigQuery).toHaveBeenCalledWith(
      "TEST_CLIENT",
      "merchantID",
      "A1B2C3D4E5F6G7"
    );
  });

  it("preserves an existing merchantID-keyed value already on the row (case-consistent merge)", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ rawData: { merchantID: "OLDVALUE" } }]),
        }),
      }),
    });

    let capturedSet: Record<string, unknown> | undefined;
    mockUpdate.mockReturnValue({
      set: (setArg: Record<string, unknown>) => ({
        where: () => {
          capturedSet = setArg;
          return Promise.resolve();
        },
      }),
    });

    mockInsert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    });

    // @ts-expect-error minimal Next.js route context for the test
    await POST(request("NEWVALUE123"), params());

    const writtenRawData = capturedSet?.rawData as Record<string, string>;
    expect(writtenRawData.merchantID).toBe("NEWVALUE123");
  });
});
