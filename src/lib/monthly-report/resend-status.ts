export type ResendDeliveryStatus =
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "sent"
  | "queued";

export type MonthlySendDelivery = {
  at: string | null;
  status: ResendDeliveryStatus;
  to: string[];
  resendId: string | null;
};

export function normalizeResendLastEvent(event: string | null | undefined): ResendDeliveryStatus {
  const key = (event ?? "").trim().toLowerCase();
  if (key === "delivered" || key === "opened" || key === "clicked") return "delivered";
  if (key === "bounced") return "bounced";
  if (key === "complained") return "complained";
  if (key === "failed" || key === "delivery_delayed") return "failed";
  if (key === "sent" || key === "scheduled") return "sent";
  return "queued";
}

export async function fetchResendEmailDelivery(
  id: string,
): Promise<{ lastEvent: string; createdAt: string | null; to: string[] } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !id.trim()) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id.trim())}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      last_event?: string;
      created_at?: string;
      to?: string[];
    };
    return {
      lastEvent: typeof json.last_event === "string" ? json.last_event : "sent",
      createdAt: typeof json.created_at === "string" ? json.created_at : null,
      to: Array.isArray(json.to) ? json.to.filter((x): x is string => typeof x === "string") : [],
    };
  } catch (err) {
    console.error("[monthly-report] Resend lookup failed", err);
    return null;
  }
}

export async function deliveryFromResend(opts: {
  resendEmailId: string | null;
  sentAt: string | null;
  sentTo: string[];
  failed?: boolean;
}): Promise<MonthlySendDelivery | null> {
  if (!opts.resendEmailId && !opts.sentAt && !opts.failed) return null;
  if (opts.resendEmailId) {
    const remote = await fetchResendEmailDelivery(opts.resendEmailId);
    if (remote) {
      return {
        at: remote.createdAt ?? opts.sentAt,
        status: normalizeResendLastEvent(remote.lastEvent),
        to: remote.to.length > 0 ? remote.to : opts.sentTo,
        resendId: opts.resendEmailId,
      };
    }
  }
  if (opts.failed) {
    return { at: opts.sentAt, status: "failed", to: opts.sentTo, resendId: opts.resendEmailId };
  }
  if (opts.sentAt) {
    return { at: opts.sentAt, status: "sent", to: opts.sentTo, resendId: opts.resendEmailId };
  }
  return null;
}
