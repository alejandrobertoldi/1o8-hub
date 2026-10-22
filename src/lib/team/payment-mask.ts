import { decryptPii, PiiKeyMissingError } from "@/lib/crypto/pii";
import type { userPaymentDetails } from "@/lib/db/schema";

type PaymentRow = typeof userPaymentDetails.$inferSelect;

/** Legacy plaintext QR values written before encryption was wired. */
export function isPlainWiseQr(value: string): boolean {
  return value.startsWith("data:image/") || /^https:\/\//i.test(value);
}

/**
 * Resolve the Wise QR for the masked GET payload.
 * - Ciphertext at rest → decrypt for the authorized viewer
 * - Legacy plaintext → return as-is (re-encrypted on next save)
 * - Missing key / bad payload → null (never ship ciphertext)
 */
export function resolveWiseQrUrl(
  stored: string | null,
  keyVersion: number
): string | null {
  if (!stored) return null;
  if (isPlainWiseQr(stored)) return stored;
  try {
    return decryptPii(stored, keyVersion);
  } catch (err) {
    if (!(err instanceof PiiKeyMissingError)) {
      console.error("[payment] wise QR decrypt failed");
    }
    return null;
  }
}

/**
 * Explicit allowlist for the payment block. Ciphertext columns never appear.
 * Wise QR is decrypted here so the UI can render it; at rest it is ciphertext.
 */
export function maskPayment(row: PaymentRow) {
  return {
    paymentMethod: row.paymentMethod,
    paymentCadence: row.paymentCadence,
    invoicesRequired: row.invoicesRequired,
    payeeName: row.payeeName,
    bankName: row.bankName,
    bankCountry: row.bankCountry,
    accountIdentifierLast4: row.accountIdentifierLast4,
    taxIdLast4: row.taxIdLast4,
    wiseQrUrl: resolveWiseQrUrl(row.wiseQrUrl, row.keyVersion),
    keyVersion: row.keyVersion,
    hasAccountIdentifier: row.accountIdentifierCiphertext !== null,
    hasTaxId: row.taxIdCiphertext !== null,
  };
}
