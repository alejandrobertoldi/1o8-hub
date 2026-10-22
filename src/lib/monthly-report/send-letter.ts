import type { Report } from "@/components/monthly-report/types";
import { MONTHLY_REPORT_CLIENT_FROM, sendResendEmail } from "@/lib/email";
import { buildMonthlyReportEmail } from "./letter";
import { filterSendRecipients, staffThreadCopies } from "./recipients";
import { loadSendAddressBook } from "./send-context";

export type DispatchLetterOk = {
  ok: true;
  to: string[];
  replyTo: string;
  cc: string[];
  html: string;
  resendId: string | null;
};

export type DispatchLetterFail = {
  ok: false;
  error: string;
  statusCode: 409 | 502;
};

/** Build and send the client letter. Auto-send passes no requested list (full address book). */
export async function dispatchMonthlyClientLetter(opts: {
  report: Report;
  period: string;
  clientIdCode: string;
  accountManager: string | null;
  requestedRecipients?: unknown;
  extraRecipients?: unknown;
  issuedAt?: Date | string | null;
}): Promise<DispatchLetterOk | DispatchLetterFail> {
  const book = await loadSendAddressBook({
    clientIdCode: opts.clientIdCode,
    accountManager: opts.accountManager,
  });
  if (book.recipients.length === 0) {
    return { ok: false, error: "No client email on AAC contacts or portal users", statusCode: 409 };
  }
  const to = filterSendRecipients(book.recipients, opts.requestedRecipients, opts.extraRecipients);
  if (to.length === 0) {
    return { ok: false, error: "No recipients enabled", statusCode: 409 };
  }
  const thread = staffThreadCopies({
    to,
    accountManagerEmail: book.accountManagerEmail,
  });
  if (!thread.replyTo) {
    return { ok: false, error: "No AM email on this client — cannot set Reply-To", statusCode: 409 };
  }
  const replyTo = thread.replyTo;
  const threadId = crypto.randomUUID();
  const letter = buildMonthlyReportEmail({
    report: opts.report,
    period: opts.period,
    clientIdCode: opts.clientIdCode,
    threadId,
    issuedAt: opts.issuedAt,
  });
  const sent = await sendResendEmail({
    to,
    cc: thread.cc,
    from: MONTHLY_REPORT_CLIENT_FROM,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
    replyTo,
    headers: { "X-Entity-Ref-ID": threadId },
  });
  if (!sent.ok) {
    return { ok: false, error: sent.error, statusCode: 502 };
  }
  return {
    ok: true,
    to,
    replyTo,
    cc: thread.cc,
    html: letter.html,
    resendId: sent.id ?? null,
  };
}
