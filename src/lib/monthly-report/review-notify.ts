import { MONTHLY_REPORT_FINAL_REVIEWER_EMAIL } from "@/lib/constants";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { MONTHLY_REPORT_REPLY_TO, MONTHLY_REPORT_STAFF_FROM, sendResendEmail } from "@/lib/email";
import { emailForAccountManager } from "./recipients";
import { MONTHLY_REPORT_EMAIL_ASSET_ORIGIN } from "./letter";
import type { MonthlyReportStatus } from "./report-store";

export function monthlyReviewHubUrl(): string {
  return `${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}/reports/monthly`;
}

export type StaffReviewRole = "pm" | "am" | "jake";

function wrapStaffEmail(lead: string, extraHtml = "", extraText = ""): { html: string; text: string } {
  const href = monthlyReviewHubUrl();
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#2C2B35;background:#F4F4F2;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FEFEFE;border:1px solid #D8D7DC;padding:24px;">
    <tr><td>
      <p style="margin:0 0 12px;font-size:15px;">${escapeBasic(lead)}</p>
      ${extraHtml}
      <p style="margin:20px 0 0;">
        <a href="${href}" style="display:inline-block;padding:10px 18px;background:#2C2B35;color:#FEFEFE;text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;">Open monthly reports</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
  const text = `${lead}${extraText}\n\n${href}`;
  return { html, text };
}

export function buildStaffReviewEmail(opts: {
  role: StaffReviewRole;
  clientName: string;
  periodLabel: string;
  kind: "generated" | "approve" | "send_back";
  note?: string | null;
}): { subject: string; html: string; text: string } {
  const client = opts.clientName.trim() || "a client";
  const period = opts.periodLabel.trim() || "this month";
  const note = opts.note?.trim();

  let subject: string;
  let lead: string;
  if (opts.kind === "generated") {
    subject = `${client} — ${period} monthly report is ready for PM review`;
    lead = `The ${period} monthly report for ${client} has been generated. Open the hub to review it, regenerate if the numbers look off, or approve to send it to the AM.`;
  } else if (opts.kind === "send_back") {
    subject = `${client} — ${period} monthly report was sent back`;
    lead = `The ${period} monthly report for ${client} was sent back. Open the hub to review the note and take the next step.`;
  } else if (opts.role === "am") {
    subject = `${client} — ${period} monthly report is ready for AM review`;
    lead = `The PM approved the ${period} monthly report for ${client}. Open the hub to review, add a client note if needed, and approve.`;
  } else {
    subject = `${client} — ${period} monthly report is ready for your review`;
    lead = `The AM approved the ${period} monthly report for ${client}. Open the hub to review it, send it back, or approve — approved reports are sent to the client automatically.`;
  }

  const noteHtml = note
    ? `<p style="margin:16px 0 0;font-size:13px;color:#6E6C77;"><strong>Note:</strong> ${escapeBasic(note)}</p>`
    : "";
  const wrapped = wrapStaffEmail(lead, noteHtml, note ? `\n\nNote: ${note}` : "");
  return { subject, ...wrapped };
}

export function buildPmDigestEmail(opts: {
  periodLabel: string;
  clients: string[];
}): { subject: string; html: string; text: string } {
  const period = opts.periodLabel.trim() || "this month";
  const names = opts.clients.map((name) => name.trim()).filter(Boolean);
  const subject = `${period} monthly reports are ready for your review`;
  const lead = `The ${period} monthly reports for the following clients are ready. Review each one, add notes if the numbers need context, then approve.`;
  const listHtml = names.length
    ? `<ul style="margin:16px 0 0;padding-left:20px;font-size:15px;color:#2C2B35;">${names.map((name) => `<li>${escapeBasic(name)}</li>`).join("")}</ul>`
    : "";
  const listText = names.length ? `\n\n${names.map((name) => `- ${name}`).join("\n")}` : "";
  const wrapped = wrapStaffEmail(lead, listHtml, listText);
  return { subject, ...wrapped };
}

export function buildCeoDigestEmail(opts: {
  periodLabel: string;
}): { subject: string; html: string; text: string } {
  const period = opts.periodLabel.trim() || "this month";
  const subject = `${period} monthly reports are ready for CEO review`;
  const lead = `You have ${period} monthly reports waiting to review and approve. Approved reports are sent to the client automatically. Further reports will appear under Waiting for me as AMs finish — you will not get another email this period unless the queue is emptied and fills again.`;
  return { subject, ...wrapStaffEmail(lead) };
}

export function groupClientNamesByPm(
  rows: Array<{ name: string; projectManager: string | null }>,
): Array<{ projectManager: string; clients: string[] }> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const pm = row.projectManager?.trim();
    if (!pm) continue;
    const list = map.get(pm) ?? [];
    list.push(row.name);
    map.set(pm, list);
  }
  return [...map.entries()].map(([projectManager, clients]) => ({
    projectManager,
    clients: [...clients].sort((a, b) => a.localeCompare(b)),
  }));
}

const CEO_QUEUE_STATUSES = new Set(["jake_review", "ready", "sent", "failed"]);

/** True when no other report in this period is already in the CEO queue. */
export function isFirstCeoQueueEntry(
  others: Array<{ clientIdCode: string; status: string }>,
  currentClientIdCode: string,
): boolean {
  return !others.some((row) =>
    row.clientIdCode !== currentClientIdCode && CEO_QUEUE_STATUSES.has(row.status),
  );
}

function escapeBasic(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function staffDirectory(): Promise<Array<{ name: string | null; email: string }>> {
  return db.select({ name: users.name, email: users.email }).from(users);
}

export async function emailForStaffName(name: string | null): Promise<string | null> {
  return emailForAccountManager(await staffDirectory(), name);
}

export function staffNotifyKind(
  status: MonthlyReportStatus,
  previousStatus?: MonthlyReportStatus | null,
): "generated" | "approve" | "send_back" {
  if (previousStatus === "jake_review" && status === "am_review") return "send_back";
  if (status === "generated" && previousStatus && previousStatus !== "generated") return "send_back";
  if (status === "generated" || status === "pm_review") return "generated";
  return "approve";
}

async function sendStaffLetter(to: string, letter: { subject: string; html: string; text: string }): Promise<void> {
  const sent = await sendResendEmail({
    to,
    from: MONTHLY_REPORT_STAFF_FROM,
    subject: letter.subject,
    html: letter.html,
    text: letter.text,
    replyTo: MONTHLY_REPORT_REPLY_TO,
  });
  if (!sent.ok) {
    console.error("[monthly-report] stage email failed", sent.error);
  }
}

/** One email per PM listing every client generated in this wave. Never throws. */
export async function notifyPmReportsReady(opts: {
  periodLabel: string;
  rows: Array<{ name: string; projectManager: string | null }>;
}): Promise<void> {
  try {
    const groups = groupClientNamesByPm(opts.rows);
    for (const group of groups) {
      const to = await emailForStaffName(group.projectManager);
      if (!to) {
        console.warn("[monthly-report] no inbox for PM digest", { projectManager: group.projectManager });
        continue;
      }
      await sendStaffLetter(to, buildPmDigestEmail({
        periodLabel: opts.periodLabel,
        clients: group.clients,
      }));
    }
  } catch (err) {
    console.error("[monthly-report] PM digest failed", err);
  }
}

/** One CEO email for the period the first time any report reaches jake_review. Never throws. */
export async function notifyCeoFirstQueue(opts: { periodLabel: string }): Promise<void> {
  try {
    await sendStaffLetter(
      MONTHLY_REPORT_FINAL_REVIEWER_EMAIL,
      buildCeoDigestEmail({ periodLabel: opts.periodLabel }),
    );
  } catch (err) {
    console.error("[monthly-report] CEO digest failed", err);
  }
}

/**
 * Email the person who should act now for AM (per client) and send-back.
 * Fresh generate uses notifyPmReportsReady. First CEO queue uses notifyCeoFirstQueue.
 * Never throws — generate/approve must not fail on mail.
 */
export async function notifyMonthlyReportStage(opts: {
  status: MonthlyReportStatus;
  previousStatus?: MonthlyReportStatus | null;
  clientName: string;
  periodLabel: string;
  projectManager: string | null;
  accountManager: string | null;
  note?: string | null;
}): Promise<void> {
  const kind = staffNotifyKind(opts.status, opts.previousStatus);

  let role: StaffReviewRole;
  let to: string | null;
  if (opts.status === "generated" || opts.status === "pm_review") {
    if (kind !== "send_back") return;
    role = "pm";
    to = await emailForStaffName(opts.projectManager);
  } else if (opts.status === "am_review") {
    role = "am";
    to = await emailForStaffName(opts.accountManager);
  } else if (opts.status === "jake_review") {
    return;
  } else {
    return;
  }

  if (!to) {
    console.warn("[monthly-report] no inbox for stage email", { status: opts.status, role });
    return;
  }

  await sendStaffLetter(to, buildStaffReviewEmail({
    role,
    clientName: opts.clientName,
    periodLabel: opts.periodLabel,
    kind,
    note: opts.note,
  }));
}
