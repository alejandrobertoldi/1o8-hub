"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QrCode, Upload } from "lucide-react";
import { toast } from "sonner";
import type { TeamUserPayload } from "./user-detail";

type Payment = NonNullable<TeamUserPayload["payment"]>;

/**
 * The exact enum values PUT /api/team/[userId]/payment accepts. Anything else
 * is a 400 the route takes before it touches the database.
 * Wise is first — most common receive method for the team.
 */
const PAYMENT_METHODS = [
  "wise",
  "bank_transfer",
  "payoneer",
  "paypal",
  "other",
] as const;
const PAYMENT_CADENCES = ["monthly", "biweekly", "weekly", "per_invoice"] as const;

const METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  wise: "Wise",
  bank_transfer: "Bank transfer",
  payoneer: "Payoneer",
  paypal: "PayPal",
  other: "Other",
};

/** Client-side cap before base64 (~300KB binary). */
const MAX_QR_BYTES = 300_000;

/**
 * The ONLY writable keys PUT accepts (payment/route.ts WRITABLE_KEYS).
 * Any other key returns 400 `Unknown field: <key>` with ZERO database access —
 * so never PUT the GET payload back: `accountIdentifierLast4`, `taxIdLast4`,
 * `keyVersion`, `hasAccountIdentifier` and `hasTaxId` are all in the GET
 * payload, are all read-only, and are all rejected.
 *
 * Per key: `undefined` (i.e. absent from the JSON) means "leave alone", `null`
 * or an empty string means "clear", a string means "set". `invoicesRequired`
 * must be a REAL boolean — `"true"` is its own 400.
 */
type PaymentPut = {
  paymentMethod?: string | null;
  paymentCadence?: string | null;
  payeeName?: string | null;
  bankName?: string | null;
  bankCountry?: string | null;
  invoicesRequired?: boolean;
  accountIdentifier?: string | null;
  taxId?: string | null;
  wiseQrUrl?: string | null;
};

/**
 * Form state seeded from the MASKED payload. The two secret inputs always
 * start blank and are never seeded from a revealed value — a decrypted
 * identifier must not enter form state, a DOM value attribute, or a re-render.
 */
function formFrom(payment: Payment | null) {
  return {
    paymentMethod: payment?.paymentMethod ?? "",
    paymentCadence: payment?.paymentCadence ?? "",
    payeeName: payment?.payeeName ?? "",
    bankName: payment?.bankName ?? "",
    bankCountry: payment?.bankCountry ?? "",
    invoicesRequired: payment?.invoicesRequired ?? false,
    accountIdentifier: "",
    taxId: "",
    wiseQrUrl: payment?.wiseQrUrl ?? "",
    clearAccountIdentifier: false,
    clearTaxId: false,
    clearWiseQr: false,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read file"));
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

const FIELD =
  "w-full rounded-md border border-border bg-background px-2 py-1 focus:border-brand focus:outline-none";
const MICRO = "text-[10px] font-bold uppercase text-muted-foreground";

export function PaymentBlock({
  userId,
  payment,
  canEdit,
}: {
  userId: string;
  payment: Payment | null;
  /**
   * `access.isSuperAdmin`, passed explicitly. Payment details are super-admin
   * only for BOTH read and write. The three capability flags are INDEPENDENT
   * (spec D2) — `isAdmin` never implies this one and neither does `isSelf`, so
   * this is never derived from "the payload arrived, therefore I may write".
   */
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  // Revealed values live in component state ONLY. They are never written into
  // the react-query cache, so they vanish on navigation and are never
  // persisted anywhere the next viewer could reach.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFrom(payment));
  const qrInputRef = useRef<HTMLInputElement>(null);

  const isWise = form.paymentMethod === "wise";
  const viewIsWise = payment?.paymentMethod === "wise";

  const reveal = useMutation({
    mutationFn: async (field: "accountIdentifier" | "taxId") => {
      const res = await fetch(`/api/team/${userId}/payment/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Reveal failed" }));
        // 503 means USER_PII_ENCRYPTION_KEY is not configured. Surfacing the
        // route's own message tells the admin it is a configuration problem
        // rather than a permission one.
        throw new Error(error ?? "Reveal failed");
      }
      const { value } = (await res.json()) as { value: string };
      return { field, value };
    },
    onSuccess: ({ field, value }) => setRevealed((r) => ({ ...r, [field]: value })),
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * The ONLY writer of `user_payment_details`. Without it no row is ever
   * created, the card reads "No payment details recorded." forever, and
   * `hasAccountIdentifier`/`hasTaxId` stay false — which makes the Reveal
   * button below unreachable code.
   */
  const save = useMutation({
    mutationFn: async () => {
      const body: PaymentPut = {
        // "" is sent as null: optionalText() maps an empty string to null
        // anyway, and being explicit keeps "cleared" distinguishable from
        // "untouched" for the five non-secret fields.
        paymentMethod: form.paymentMethod || null,
        paymentCadence: form.paymentCadence || null,
        payeeName: form.payeeName || null,
        bankName: form.bankName || null,
        bankCountry: form.bankCountry || null,
        // A REAL boolean. `"true"` is a 400 taken before any write.
        invoicesRequired: form.invoicesRequired,
      };
      // The two secrets are OMITTED unless the admin acted. An absent key
      // disappears from JSON.stringify and the route reads it as "leave
      // alone"; sending "" instead would WIPE the stored ciphertext and its
      // last4 on every save of an unrelated field.
      if (form.clearAccountIdentifier) body.accountIdentifier = null;
      else if (form.accountIdentifier.trim()) {
        body.accountIdentifier = form.accountIdentifier.trim();
      }
      if (form.clearTaxId) body.taxId = null;
      else if (form.taxId.trim()) body.taxId = form.taxId.trim();

      if (form.paymentMethod === "wise") {
        if (form.clearWiseQr) body.wiseQrUrl = null;
        else if (form.wiseQrUrl.trim()) body.wiseQrUrl = form.wiseQrUrl.trim();
      }

      const res = await fetch(`/api/team/${userId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Every branch the route emits carries its own `error` string: 400
        // (unknown key, bad enum, non-boolean, "Nothing to update"), 401, 403,
        // and 503. Surface the server's text rather than guessing the cause —
        // PUT's 503 is "USER_PII_ENCRYPTION_KEY is not configured" and aborts
        // the WHOLE request, so nothing is half-saved, while the reveal route
        // has a second, differently-worded 503 for a key_version mismatch.
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(error ?? "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      // A just-saved secret makes any value revealed a moment ago stale.
      setRevealed({});
      setEditing(false);
      toast.success("Payment details saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function onQrFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Wise QR must be an image (PNG or JPEG)");
      return;
    }
    if (file.size > MAX_QR_BYTES) {
      toast.error("Wise QR must be under 300KB");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((f) => ({ ...f, wiseQrUrl: dataUrl, clearWiseQr: false }));
    } catch {
      toast.error("Could not read QR image");
    }
  }

  function detailRows(p: Payment): [string, string | null][] {
    const methodLabel =
      p.paymentMethod && p.paymentMethod in METHOD_LABELS
        ? METHOD_LABELS[p.paymentMethod as keyof typeof METHOD_LABELS]
        : p.paymentMethod;
    return [
      ["Method", methodLabel],
      ["Cadence", p.paymentCadence],
      // NOT NULL DEFAULT false, so this cannot conflate null with false.
      ["Invoices required", p.invoicesRequired ? "Yes" : "No"],
      ["Payee", p.payeeName],
      ...(p.paymentMethod === "wise"
        ? []
        : ([
            ["Bank", p.bankName],
            ["Bank country", p.bankCountry],
          ] as [string, string | null][])),
    ];
  }

  function secretRow(
    label: string,
    field: "accountIdentifier" | "taxId",
    last4: string | null,
    present: boolean
  ) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1">
        <span className={MICRO}>{label}</span>
        <span className="flex items-center gap-2 text-sm tabular-nums">
          {revealed[field] ?? (last4 ? `••••${last4}` : "—")}
          {present && !revealed[field] && (
            <button
              type="button"
              disabled={reveal.isPending}
              onClick={() => reveal.mutate(field)}
              className="rounded-lg border border-stone-300 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-stone-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Reveal
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div>
      {payment ? (
        <>
          {detailRows(payment).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-1">
              <span className={MICRO}>{label}</span>
              <span className="text-sm">{value ?? "—"}</span>
            </div>
          ))}
          {secretRow(
            viewIsWise ? "Wise ID" : "Account",
            "accountIdentifier",
            payment.accountIdentifierLast4,
            payment.hasAccountIdentifier
          )}
          {viewIsWise && (
            <div className="py-2">
              <span className={MICRO}>Wise QR</span>
              {payment.wiseQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL / admin-only
                <img
                  src={payment.wiseQrUrl}
                  alt="Wise receive QR"
                  className="mt-1.5 size-36 rounded-md border border-border object-contain bg-white p-1"
                />
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No QR uploaded</p>
              )}
            </div>
          )}
          {secretRow("Tax ID", "taxId", payment.taxIdLast4, payment.hasTaxId)}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Revealing an identifier is recorded in the event log.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No payment details recorded.</p>
      )}

      {canEdit && !editing && (
        <button
          type="button"
          onClick={() => {
            // Re-seed from the CURRENT payload each time it opens, not once at
            // mount: a successful save invalidates the parent query and this
            // component re-renders with fresh props.
            setForm(formFrom(payment));
            setEditing(true);
          }}
          className="mt-3 rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_16px_-4px_var(--brand-glow)]"
        >
          {payment ? "Edit payment details" : "Add payment details"}
        </button>
      )}

      {canEdit && editing && (
        // Rendered INLINE rather than as a second modal: the card is already
        // super-admin gated, and the pay-period dialog's keyboard behaviour is
        // a known open item that should not be duplicated here.
        <div className="mt-3 space-y-2 rounded-lg border border-border p-3 text-sm">
          <label className="block">
            <span className={MICRO}>Method</span>
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              className={FIELD}
            >
              <option value="">Not set</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={MICRO}>Cadence</span>
            <select
              value={form.paymentCadence}
              onChange={(e) => setForm({ ...form, paymentCadence: e.target.value })}
              className={FIELD}
            >
              <option value="">Not set</option>
              {PAYMENT_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={MICRO}>Payee name</span>
            <input
              maxLength={200}
              value={form.payeeName}
              onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
              className={FIELD}
            />
          </label>

          {isWise ? (
            <>
              <label className="block">
                <span className={MICRO}>
                  Wise ID
                  {payment?.accountIdentifierLast4
                    ? ` — stored: ••••${payment.accountIdentifierLast4}`
                    : ""}
                </span>
                <input
                  value={form.accountIdentifier}
                  onChange={(e) =>
                    setForm({ ...form, accountIdentifier: e.target.value })
                  }
                  disabled={form.clearAccountIdentifier}
                  placeholder="Leave blank to keep the stored value"
                  className={`${FIELD} disabled:opacity-50`}
                />
              </label>
              {payment?.hasAccountIdentifier && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.clearAccountIdentifier}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        clearAccountIdentifier: e.target.checked,
                      })
                    }
                  />
                  <span className={MICRO}>Remove the stored Wise ID</span>
                </label>
              )}

              <div className="block">
                <span className={MICRO}>Wise QR</span>
                <input
                  ref={qrInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void onQrFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={form.clearWiseQr}
                  onClick={() => qrInputRef.current?.click()}
                  className={`mt-1 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-6 text-center transition-colors hover:border-brand hover:bg-muted/40 disabled:opacity-50 ${
                    form.wiseQrUrl && !form.clearWiseQr ? "py-3" : ""
                  }`}
                >
                  {form.wiseQrUrl && !form.clearWiseQr ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data URL preview
                    <img
                      src={form.wiseQrUrl}
                      alt="Wise QR preview"
                      className="size-32 rounded-md object-contain bg-white p-1"
                    />
                  ) : (
                    <QrCode className="size-8 text-muted-foreground" />
                  )}
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Upload className="size-3.5" />
                    {form.wiseQrUrl && !form.clearWiseQr
                      ? "Replace QR image"
                      : "Upload Wise QR code"}
                  </span>
                </button>
                {payment?.wiseQrUrl && (
                  <label className="mt-1.5 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.clearWiseQr}
                      onChange={(e) =>
                        setForm({ ...form, clearWiseQr: e.target.checked })
                      }
                    />
                    <span className={MICRO}>Remove the stored Wise QR</span>
                  </label>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <label className="block flex-1">
                  <span className={MICRO}>Bank</span>
                  <input
                    maxLength={120}
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="block w-28">
                  {/* char(2). The route does NOT format-check this one, so without
                      maxLength an over-long value reaches Postgres as a 500. */}
                  <span className={MICRO}>Bank country</span>
                  <input
                    maxLength={2}
                    value={form.bankCountry}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bankCountry: e.target.value.toUpperCase(),
                      })
                    }
                    className={`${FIELD} uppercase`}
                  />
                </label>
              </div>
              <p className="pt-1 text-[10px] text-muted-foreground">
                The two identifiers below are encrypted on save and are never
                returned in full by this page. Leave one blank to keep whatever
                is already stored.
              </p>
              <label className="block">
                <span className={MICRO}>
                  Account identifier
                  {payment?.accountIdentifierLast4
                    ? ` — stored: ••••${payment.accountIdentifierLast4}`
                    : ""}
                </span>
                <input
                  value={form.accountIdentifier}
                  onChange={(e) =>
                    setForm({ ...form, accountIdentifier: e.target.value })
                  }
                  disabled={form.clearAccountIdentifier}
                  placeholder="Leave blank to keep the stored value"
                  className={`${FIELD} disabled:opacity-50`}
                />
              </label>
              {payment?.hasAccountIdentifier && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.clearAccountIdentifier}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        clearAccountIdentifier: e.target.checked,
                      })
                    }
                  />
                  <span className={MICRO}>Remove the stored account identifier</span>
                </label>
              )}
            </>
          )}

          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={form.invoicesRequired}
              onChange={(e) => setForm({ ...form, invoicesRequired: e.target.checked })}
            />
            <span className={MICRO}>Invoices required</span>
          </label>

          {isWise && (
            <p className="pt-1 text-[10px] text-muted-foreground">
              Wise ID is encrypted on save and never returned in full. Leave
              blank to keep whatever is already stored.
            </p>
          )}

          <label className="block">
            <span className={MICRO}>
              Tax ID{payment?.taxIdLast4 ? ` — stored: ••••${payment.taxIdLast4}` : ""}
            </span>
            <input
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              disabled={form.clearTaxId}
              placeholder="Leave blank to keep the stored value"
              className={`${FIELD} disabled:opacity-50`}
            />
          </label>
          {payment?.hasTaxId && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.clearTaxId}
                onChange={(e) => setForm({ ...form, clearTaxId: e.target.checked })}
              />
              <span className={MICRO}>Remove the stored tax ID</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs text-muted-foreground hover:bg-stone-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="rounded-lg bg-brand-solid px-4 py-2 text-sm font-bold text-white hover:bg-brand-solid-hover disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
