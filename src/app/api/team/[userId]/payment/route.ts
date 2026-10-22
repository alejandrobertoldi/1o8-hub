import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { userPaymentDetails } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { encryptPii, PiiKeyMissingError } from "@/lib/crypto/pii";
import { logEventAsync } from "@/lib/event-logger";

// node:crypto has no edge equivalent.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = new Set(["wise", "bank_transfer", "payoneer", "paypal", "other"]);
const CADENCES = new Set(["monthly", "biweekly", "weekly", "per_invoice"]);
const WRITABLE_KEYS = new Set([
  "paymentMethod",
  "paymentCadence",
  "payeeName",
  "bankName",
  "bankCountry",
  "invoicesRequired",
  "accountIdentifier",
  "taxId",
  "wiseQrUrl",
]);
/** Cap for data-URL QR images (~300KB binary → ~400KB base64 text). */
const MAX_WISE_QR_URL_LENGTH = 400_000;

/**
 * Column widths read from src/lib/db/schema.ts (user_payment_details):
 * payee_name is varchar(200) and bank_name is varchar(120). Without these an
 * over-long value reaches Postgres and surfaces as an uncaught 500 ("value too
 * long for type character varying(N)") instead of a 400 naming the field.
 * Mirrors the MAX_LENGTHS convention in src/app/api/team/[userId]/route.ts.
 */
const MAX_LENGTHS: Record<string, number> = {
  payeeName: 200,
  bankName: 120,
};

/** `undefined` = leave alone. `null` = clear. A string = set. */
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    return value.trim() ? value.trim() : null;
  }
  throw new Error(`must be a string, null, or undefined`);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // Validate all keys and types before any processing.
  for (const key of Object.keys(b)) {
    if (!WRITABLE_KEYS.has(key)) {
      return NextResponse.json(
        { error: `Unknown field: ${key}` },
        { status: 400 }
      );
    }
  }

  // Validate types for known fields.
  if (
    b.paymentMethod !== undefined &&
    b.paymentMethod !== null &&
    (typeof b.paymentMethod !== "string" || !METHODS.has(b.paymentMethod))
  ) {
    return NextResponse.json(
      { error: `paymentMethod must be one of ${[...METHODS].join(", ")}` },
      { status: 400 }
    );
  }
  if (
    b.paymentCadence !== undefined &&
    b.paymentCadence !== null &&
    (typeof b.paymentCadence !== "string" || !CADENCES.has(b.paymentCadence))
  ) {
    return NextResponse.json(
      { error: `paymentCadence must be one of ${[...CADENCES].join(", ")}` },
      { status: 400 }
    );
  }
  if (
    b.invoicesRequired !== undefined &&
    b.invoicesRequired !== null &&
    typeof b.invoicesRequired !== "boolean"
  ) {
    return NextResponse.json(
      { error: `invoicesRequired must be a boolean` },
      { status: 400 }
    );
  }

  const values: Record<string, unknown> = { userId };
  const changed: string[] = [];

  for (const field of [
    "paymentMethod",
    "paymentCadence",
    "payeeName",
    "bankName",
    "bankCountry",
  ] as const) {
    try {
      const v = optionalText(b[field]);
      if (v !== undefined) {
        const max = MAX_LENGTHS[field];
        if (v !== null && max !== undefined && v.length > max) {
          return NextResponse.json(
            { error: `${field} must be at most ${max} characters` },
            { status: 400 }
          );
        }
        // bank_country is char(2), not varchar: Postgres silently SPACE-PADS a
        // one-character value, so "P" would store and read back as "P " and
        // look like a real country code. Reject anything that is not exactly
        // two letters, before the write.
        if (field === "bankCountry" && v !== null && !/^[A-Za-z]{2}$/.test(v)) {
          return NextResponse.json(
            { error: "bankCountry must be a two-letter country code" },
            { status: 400 }
          );
        }
        values[field] = v;
        changed.push(field);
      }
    } catch {
      return NextResponse.json(
        { error: `${field} must be a string or null` },
        { status: 400 }
      );
    }
  }
  if (typeof b.invoicesRequired === "boolean") {
    values.invoicesRequired = b.invoicesRequired;
    changed.push("invoicesRequired");
  }

  // Validate Wise QR shape before encryption (ciphertext is not a data URL).
  let wiseQrPlain: string | null | undefined;
  if (b.wiseQrUrl !== undefined) {
    try {
      wiseQrPlain = optionalText(b.wiseQrUrl);
    } catch {
      return NextResponse.json(
        { error: "wiseQrUrl must be a string or null" },
        { status: 400 }
      );
    }
    if (
      wiseQrPlain !== undefined &&
      wiseQrPlain !== null &&
      !wiseQrPlain.startsWith("data:image/") &&
      !/^https:\/\//i.test(wiseQrPlain)
    ) {
      return NextResponse.json(
        { error: "wiseQrUrl must be an image data URL or an https URL" },
        { status: 400 }
      );
    }
    if (
      wiseQrPlain !== undefined &&
      wiseQrPlain !== null &&
      wiseQrPlain.length > MAX_WISE_QR_URL_LENGTH
    ) {
      return NextResponse.json(
        { error: "wiseQrUrl is too large (max ~300KB image)" },
        { status: 400 }
      );
    }
  }

  // Encryption happens BEFORE any write. A missing key must abort the whole
  // request, not half-save the non-secret fields and then fail.
  // Encrypted at rest: Wise ID (accountIdentifier), tax ID, Wise QR.
  try {
    for (const [input, cipherCol, last4Col] of [
      ["accountIdentifier", "accountIdentifierCiphertext", "accountIdentifierLast4"],
      ["taxId", "taxIdCiphertext", "taxIdLast4"],
    ] as const) {
      const raw = b[input];
      if (raw === undefined) continue;
      if (raw === null || (typeof raw === "string" && !raw.trim())) {
        values[cipherCol] = null;
        values[last4Col] = null;
        changed.push(input);
        continue;
      }
      if (typeof raw !== "string") {
        return NextResponse.json(
          { error: `${input} must be a string or null` },
          { status: 400 }
        );
      }
      const enc = encryptPii(raw.trim());
      values[cipherCol] = enc.ciphertext;
      values[last4Col] = enc.last4;
      values.keyVersion = enc.keyVersion;
      changed.push(input);
    }

    if (wiseQrPlain !== undefined) {
      if (wiseQrPlain === null) {
        values.wiseQrUrl = null;
        changed.push("wiseQrUrl");
      } else {
        // Store ciphertext in wise_qr_url (column kept; content is never a URL).
        const enc = encryptPii(wiseQrPlain);
        values.wiseQrUrl = enc.ciphertext;
        values.keyVersion = enc.keyVersion;
        changed.push("wiseQrUrl");
      }
    }
  } catch (err) {
    if (err instanceof PiiKeyMissingError) {
      // 503, not 500: the request is well-formed and the server is
      // misconfigured. There is deliberately NO plaintext fallback.
      return NextResponse.json(
        {
          error:
            "Payment identifiers are unavailable: USER_PII_ENCRYPTION_KEY is not configured.",
        },
        { status: 503 }
      );
    }
    throw err;
  }

  if (changed.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // The conflict target must not appear in the SET clause. Built by deletion
  // rather than by destructuring, so there is no unused binding for eslint's
  // no-unused-vars to reject.
  const setValues: Record<string, unknown> = { ...values };
  delete setValues.userId;

  // Include updatedAt and updatedBy in the initial values so the first insert
  // records them; the conflict clause overrides with the same values.
  values.updatedAt = new Date();
  values.updatedBy = guard.session.user.id;

  await db
    .insert(userPaymentDetails)
    .values(values as typeof userPaymentDetails.$inferInsert)
    .onConflictDoUpdate({
      target: userPaymentDetails.userId,
      set: { ...setValues, updatedAt: new Date(), updatedBy: guard.session.user.id },
    });

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:payment:update",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      // Field names only — never a bank account number or a tax ID.
      detail: { fields: changed },
    })
  );

  return NextResponse.json({ success: true });
}
