import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/team/access-db", () => ({ readIsSuperAdmin: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

import { PUT } from "./route";
import { POST as REVEAL } from "./reveal/route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import { logEventAsync } from "@/lib/event-logger";
// The real crypto module — the reveal round-trip is the point of test 8.
import { encryptPii } from "@/lib/crypto/pii";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.alloc(32, 7).toString("base64");
const IBAN = "GB29NWBK60161331926819";

const originalKey = process.env.USER_PII_ENCRYPTION_KEY;

function queueSelects(...results: unknown[][]) {
  const q = [...results];
  asMock(db.select).mockImplementation(() => {
    const rows = q.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
      then: (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r),
    };
  });
}

function ctx(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function jsonReq(method: string, body: unknown) {
  return new Request("http://localhost/api/team/x/payment", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function signIn(isSuperAdmin: boolean) {
  asMock(getAuthSession).mockResolvedValue({
    user: { id: ME, role: "admin", email: "me@marketfoundry.agency", name: "Me" },
  });
  asMock(readIsSuperAdmin).mockResolvedValue(isSuperAdmin);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.USER_PII_ENCRYPTION_KEY = KEY;
  signIn(true);
  queueSelects([]);
  asMock(db.insert).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.USER_PII_ENCRYPTION_KEY;
  else process.env.USER_PII_ENCRYPTION_KEY = originalKey;
});

describe("PUT /api/team/[userId]/payment", () => {
  it("403s a caller who is not a super-admin", async () => {
    signIn(false);
    const res = await PUT(jsonReq("PUT", { bankName: "Meezan" }), ctx(THEM));
    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("503s and writes NOTHING when the key is missing and an identifier is supplied", async () => {
    // Fail-closed. Storing a plaintext IBAN in a column named
    // `..._ciphertext` would be worse than refusing, because nothing
    // downstream would ever notice.
    delete process.env.USER_PII_ENCRYPTION_KEY;
    const res = await PUT(jsonReq("PUT", { accountIdentifier: IBAN }), ctx(THEM));
    expect(res.status).toBe(503);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("still saves the non-secret fields when the key is missing", async () => {
    // Absent the key, everything else on the page must keep working.
    delete process.env.USER_PII_ENCRYPTION_KEY;
    const res = await PUT(
      jsonReq("PUT", { bankName: "Meezan", paymentMethod: "wise" }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("stores ciphertext plus last4 and returns neither", async () => {
    const res = await PUT(jsonReq("PUT", { accountIdentifier: IBAN }), ctx(THEM));
    expect(res.status).toBe(200);
    const written = asMock(asMock(db.insert).mock.results[0].value.values).mock
      .calls[0][0] as Record<string, unknown>;
    expect(written.accountIdentifierLast4).toBe("6819");
    expect(typeof written.accountIdentifierCiphertext).toBe("string");
    expect(written.accountIdentifierCiphertext).not.toContain(IBAN);
    const raw = await res.text();
    expect(raw).not.toContain("Ciphertext");
    expect(raw).not.toContain(IBAN);
  });

  it("400s on a mistyped text field", async () => {
    const res = await PUT(jsonReq("PUT", { payeeName: 123 }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("400s on an unknown top-level key alongside a valid field", async () => {
    const res = await PUT(
      jsonReq("PUT", { bankName: "Meezan", unknownField: "value" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("encrypts a Wise QR data URL at rest", async () => {
    const qr = "data:image/png;base64,iVBORw0KGgo=";
    const res = await PUT(jsonReq("PUT", { wiseQrUrl: qr }), ctx(THEM));
    expect(res.status).toBe(200);
    const written = asMock(asMock(db.insert).mock.results[0].value.values).mock
      .calls[0][0] as Record<string, unknown>;
    expect(written.wiseQrUrl).toBeTypeOf("string");
    expect(written.wiseQrUrl).not.toBe(qr);
    expect(String(written.wiseQrUrl)).not.toContain("data:image");
  });

  it("400s a Wise QR that is neither data-image nor https", async () => {
    const res = await PUT(
      jsonReq("PUT", { wiseQrUrl: "http://insecure.example/qr.png" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("wiseQrUrl");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("400s on a non-boolean invoicesRequired", async () => {
    const res = await PUT(
      jsonReq("PUT", { invoicesRequired: "true" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("400s on a non-boolean invoicesRequired paired with a valid field, instead of silently dropping it and saving the rest", async () => {
    // Unlike the lone-field case above, bankName alone would otherwise
    // succeed with a 200 — so this is the only test that actually exercises
    // the guard as load-bearing rather than incidentally passing through
    // the pre-existing "Nothing to update" 400.
    const res = await PUT(
      jsonReq("PUT", { bankName: "Meezan", invoicesRequired: "true" }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("invoicesRequired");
    expect(db.insert).not.toHaveBeenCalled();
  });

  // payee_name is varchar(200) and bank_name is varchar(120) in schema.ts.
  // Without a length check the string reaches Postgres and comes back as an
  // uncaught 500 ("value too long for type character varying(200)"), which
  // reads to the user as "the app is broken" rather than "that name is too
  // long".
  it("400s an over-long payeeName, naming the field, without writing", async () => {
    const res = await PUT(
      jsonReq("PUT", { payeeName: "a".repeat(201) }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("payeeName");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("400s an over-long bankName, naming the field, without writing", async () => {
    const res = await PUT(
      jsonReq("PUT", { bankName: "b".repeat(121) }),
      ctx(THEM)
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("bankName");
    expect(db.insert).not.toHaveBeenCalled();
  });

  // bank_country is char(2), NOT varchar: Postgres space-pads a shorter value,
  // so "P" stores and reads back as "P " and looks like a real country code.
  it("400s a one-letter bankCountry instead of letting char(2) space-pad it", async () => {
    const res = await PUT(jsonReq("PUT", { bankCountry: "P" }), ctx(THEM));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("bankCountry");
    expect(db.insert).not.toHaveBeenCalled();
  });

  // The positive control: the new checks must not reject a legitimate save.
  it("200s a two-letter bankCountry and a payeeName at the 200-char limit", async () => {
    const res = await PUT(
      jsonReq("PUT", { bankCountry: "PK", payeeName: "a".repeat(200) }),
      ctx(THEM)
    );
    expect(res.status).toBe(200);
    const written = asMock(asMock(db.insert).mock.results[0].value.values).mock
      .calls[0][0] as Record<string, unknown>;
    expect(written.bankCountry).toBe("PK");
  });

  it("records updatedBy in the first insert", async () => {
    const res = await PUT(jsonReq("PUT", { bankName: "Meezan" }), ctx(THEM));
    expect(res.status).toBe(200);
    const written = asMock(asMock(db.insert).mock.results[0].value.values).mock
      .calls[0][0] as Record<string, unknown>;
    expect(written.updatedBy).toBe(ME);
  });
});

describe("POST /api/team/[userId]/payment/reveal", () => {
  it("403s a caller who is not a super-admin", async () => {
    signIn(false);
    const res = await REVEAL(jsonReq("POST", { field: "accountIdentifier" }), ctx(THEM));
    expect(res.status).toBe(403);
  });

  it("400s a field name that is not revealable", async () => {
    const res = await REVEAL(jsonReq("POST", { field: "payeeName" }), ctx(THEM));
    expect(res.status).toBe(400);
  });

  it("503s when the key is missing", async () => {
    const { ciphertext } = encryptPii(IBAN);
    delete process.env.USER_PII_ENCRYPTION_KEY;
    queueSelects([
      { accountIdentifierCiphertext: ciphertext, taxIdCiphertext: null, keyVersion: 1 },
    ]);
    const res = await REVEAL(jsonReq("POST", { field: "accountIdentifier" }), ctx(THEM));
    expect(res.status).toBe(503);
  });

  it("returns the decrypted value and writes an audit row naming the field", async () => {
    const { ciphertext } = encryptPii(IBAN);
    queueSelects([
      { accountIdentifierCiphertext: ciphertext, taxIdCiphertext: null, keyVersion: 1 },
    ]);
    const res = await REVEAL(jsonReq("POST", { field: "accountIdentifier" }), ctx(THEM));
    expect(res.status).toBe(200);
    expect((await res.json()).value).toBe(IBAN);

    const logged = asMock(logEventAsync).mock.calls[0][0];
    expect(logged.action).toBe("user:payment:reveal");
    expect(logged.resourceId).toBe(THEM);
    expect(logged.detail).toEqual({ field: "accountIdentifier" });
    // The revealed value must never land in the audit log.
    expect(JSON.stringify(logged)).not.toContain(IBAN);
  });

  it("503s on keyVersion mismatch with distinct error message", async () => {
    const { ciphertext } = encryptPii(IBAN);
    queueSelects([
      {
        accountIdentifierCiphertext: ciphertext,
        taxIdCiphertext: null,
        keyVersion: 999,
      },
    ]);
    const res = await REVEAL(jsonReq("POST", { field: "accountIdentifier" }), ctx(THEM));
    expect(res.status).toBe(503);
    const body = await res.text();
    // Must NOT contain "not configured" message, must indicate version mismatch.
    expect(body).not.toContain("not configured");
    expect(body).toContain("key_version");
  });
});
