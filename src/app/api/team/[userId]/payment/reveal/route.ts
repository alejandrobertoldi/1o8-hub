import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPaymentDetails } from "@/lib/db/schema";
import { requireTier } from "@/lib/team/guards";
import { decryptPii, PiiKeyMissingError, PII_KEY_VERSION } from "@/lib/crypto/pii";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST, not GET, deliberately: a decrypted bank account number must never
 * reach a URL, a browser history entry, a proxy access log or a link prefetch.
 */
const REVEALABLE = {
  accountIdentifier: "accountIdentifierCiphertext",
  taxId: "taxIdCiphertext",
} as const;

type Revealable = keyof typeof REVEALABLE;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const guard = await requireTier("superadmin", userId);
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const field = (body as { field?: unknown } | null)?.field;
  if (typeof field !== "string" || !Object.hasOwn(REVEALABLE, field)) {
    return NextResponse.json(
      { error: `field must be one of ${Object.keys(REVEALABLE).join(", ")}` },
      { status: 400 }
    );
  }

  const [row] = await db
    .select({
      accountIdentifierCiphertext: userPaymentDetails.accountIdentifierCiphertext,
      taxIdCiphertext: userPaymentDetails.taxIdCiphertext,
      keyVersion: userPaymentDetails.keyVersion,
    })
    .from(userPaymentDetails)
    .where(eq(userPaymentDetails.userId, userId))
    .limit(1);

  const ciphertext = row?.[REVEALABLE[field as Revealable]];
  if (!ciphertext) {
    return NextResponse.json({ error: "Nothing stored for that field" }, { status: 404 });
  }

  // Check key version before attempting decryption, so we can distinguish the cause.
  if (row.keyVersion !== PII_KEY_VERSION) {
    return NextResponse.json(
      {
        error: `Payment identifiers are unavailable: stored key_version ${row.keyVersion} does not match current PII_KEY_VERSION ${PII_KEY_VERSION}.`,
      },
      { status: 503 }
    );
  }

  let value: string;
  try {
    value = decryptPii(ciphertext, row.keyVersion);
  } catch (err) {
    if (err instanceof PiiKeyMissingError) {
      return NextResponse.json(
        {
          error:
            "Payment identifiers are unavailable: USER_PII_ENCRYPTION_KEY is not configured.",
        },
        { status: 503 }
      );
    }
    // A GCM auth failure means the stored value was tampered with or was
    // written under a different key. Never leak which.
    console.error("[payment/reveal] decrypt failed:", err);
    return NextResponse.json({ error: "Could not decrypt that value" }, { status: 500 });
  }

  after(
    logEventAsync({
      userEmail: guard.session.user.email,
      userName: guard.session.user.name ?? null,
      section: "admin",
      action: "user:payment:reveal",
      status: "success",
      resourceType: "user",
      resourceId: userId,
      // The field NAME is the audit record. The value must never be logged.
      detail: { field },
    })
  );

  return NextResponse.json({ value });
}
