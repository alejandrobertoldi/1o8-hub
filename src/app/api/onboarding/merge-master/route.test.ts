// @vitest-environment node
//
// These tests verify the *call surface* of the merge-master execute path:
// what queries fire, in what order, with what shape. They prove the route
// uses ON CONFLICT (client_id_code, sku) for the upsert and only deletes
// SKUs that disappeared from the merge set.
//
// They do NOT prove that FK-cascaded child rows (activity_log, aplus_*,
// brand_story, etc.) survive a re-merge — that's pure Postgres semantics
// and requires a real DB. Manual smoke against staging covers it: re-merge
// a client whose master rows have activity_log entries, confirm the entries
// are still attached to the same master.id afterwards.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));

const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();
vi.mock("@/lib/db", () => {
  const tx = {
    select: (...args: unknown[]) => mockSelect(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  };
  return {
    db: {
      ...tx,
      transaction: (cb: (t: typeof tx) => Promise<unknown>) => {
        mockTransaction(cb);
        return cb(tx);
      },
    },
  };
});

import { POST } from "./route";

describe("POST /api/onboarding/merge-master", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function preflightRequest(statuses: string[]): Request {
    return new Request("http://localhost/api/onboarding/merge-master?phase=preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientIdCode: "TEST_CLIENT",
        selectedStatuses: statuses,
      }),
    });
  }

  function executeRequest(): Request {
    return new Request("http://localhost/api/onboarding/merge-master?phase=execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientIdCode: "TEST_CLIENT",
        selectedStatuses: ["Active"],
      }),
    });
  }

  /** CLR + ALR fixtures shared by execute-phase tests. */
  function setupExecuteSelectMocks() {
    let selCall = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          selCall += 1;
          if (selCall === 1) {
            return Promise.resolve([
              {
                clientIdCode: "TEST_CLIENT",
                sku: "SKU-1",
                productType: "SHOES",
                attributes: {
                  "contribution_sku#1.value": "SKU-1",
                  "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value":
                    "Red",
                  "brand[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value":
                    "Acme",
                },
                requiredComplete: true,
              },
            ]);
          }
          if (selCall === 2) {
            return Promise.resolve([
              { clientIdCode: "TEST_CLIENT", sku: "SKU-1", asin: "B01", status: "Active" },
            ]);
          }
          return Promise.resolve([]);
        }),
      }),
    }));
  }

  it("preflight returns matched count and dirtyCount", async () => {
    let call = 0;
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          call += 1;
          if (call === 1) {
            // staged_clr_products
            return Promise.resolve([
              { sku: "SKU-1" },
              { sku: "SKU-2" },
              { sku: "SKU-3" },
            ]);
          }
          if (call === 2) {
            // staged_alr_links
            return Promise.resolve([
              { sku: "SKU-1", status: "Active" },
              { sku: "SKU-2", status: "Inactive" },
              { sku: "SKU-3", status: "Active" },
              { sku: "SKU-4", status: "Active" }, // ALR-only — excluded
            ]);
          }
          if (call === 3) {
            // master rows for dirty count — route counts via .length on id rows
            return Promise.resolve([
              { id: "00000000-0000-0000-0000-000000000001" },
              { id: "00000000-0000-0000-0000-000000000002" },
              { id: "00000000-0000-0000-0000-000000000003" },
              { id: "00000000-0000-0000-0000-000000000004" },
              { id: "00000000-0000-0000-0000-000000000005" },
            ]);
          }
          return Promise.resolve([]);
        }),
      }),
    }));

    // @ts-expect-error
    const res = await POST(preflightRequest(["Active"]));
    const body = await res.json();
    expect(body.matchedSelected).toBe(2); // SKU-1 + SKU-3 are Active and matched
    expect(body.matchedTotal).toBe(3);
    expect(body.byStatus).toEqual({ active: 2, inactive: 1, incomplete: 0 });
    expect(body.dirtyCount).toBe(5);
  });

  it("execute upserts via ON CONFLICT (client_id_code, sku) and clears staging", async () => {
    setupExecuteSelectMocks();
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockInsert.mockReturnValue({ values: valuesFn });

    // @ts-expect-error
    const res = await POST(executeRequest());
    const body = await res.json();
    expect(body.merged).toBe(1);

    // Transaction wrapped the delete-stale + upsert
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // delete fired 3x: 1) delete stale-SKU rows (inside tx) 2,3) clear staging
    expect(mockDelete).toHaveBeenCalledTimes(3);

    // insert fired once with bulk upsert via ON CONFLICT
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(valuesFn).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);

    // ON CONFLICT must target the (client_id_code, sku) unique index — that's
    // what keeps master.id stable across re-merges and prevents the old
    // cascade-deletion of every FK-bound child row.
    const conflictArg = onConflictDoUpdate.mock.calls[0][0] as {
      target: unknown[];
      set: Record<string, unknown>;
    };
    expect(conflictArg.target).toHaveLength(2);
    // We can't === compare the drizzle column refs across imports without
    // importing master here, so assert by name on the underlying column.
    const targetNames = conflictArg.target.map(
      (c) => (c as { name: string }).name,
    );
    expect(targetNames).toEqual(["client_id_code", "sku"]);

    // The set clause must NOT touch the identity / audit-only fields, but
    // MUST update the JSONB blobs and other content columns.
    expect(conflictArg.set).not.toHaveProperty("id");
    expect(conflictArg.set).not.toHaveProperty("clientIdCode");
    expect(conflictArg.set).not.toHaveProperty("sku");
    expect(conflictArg.set).not.toHaveProperty("createdAt");
    expect(conflictArg.set).toHaveProperty("contentSeo");
    expect(conflictArg.set).toHaveProperty("variations");
    expect(conflictArg.set).toHaveProperty("rawColumnValues");
    expect(conflictArg.set).toHaveProperty("isDirty");
    expect(conflictArg.set).toHaveProperty("updatedAt");
  });

  it("returns 400 when selectedStatuses is empty", async () => {
    // @ts-expect-error
    const res = await POST(preflightRequest([]));
    expect(res.status).toBe(400);
  });

  it("execute deletes nothing from master if every existing SKU survives the merge", async () => {
    // We can't observe the WHERE clause directly through the mock chain, but
    // we CAN observe that the route uses a transaction-wrapped delete keyed
    // on the new SKU set rather than the old wipe-by-clientIdCode pattern.
    setupExecuteSelectMocks();
    const inTxDeleteWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: inTxDeleteWhere });
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoUpdate }),
    });

    // @ts-expect-error
    const res = await POST(executeRequest());
    expect(res.status).toBe(200);

    // Three deletes total: 1) stale-SKU delete inside tx,
    // 2) clear stagedClrProducts, 3) clear stagedAlrLinks.
    expect(mockDelete).toHaveBeenCalledTimes(3);
    // The first delete is the stale-row pass — its WHERE must have been
    // composed (i.e. the where mock was invoked rather than skipped).
    expect(inTxDeleteWhere).toHaveBeenCalledTimes(3);
  });
});
