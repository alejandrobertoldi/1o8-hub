const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "1o8 <reports@marketfoundry.agency>";

/** Reply-To for internal staff pings only. Client letters use the AM. */
export const MONTHLY_REPORT_REPLY_TO = "reports@marketfoundry.agency";

/** From for client letters. Pinned so a bad RESEND_FROM_EMAIL cannot 403 the send. */
export const MONTHLY_REPORT_CLIENT_FROM = "1o8 <reports@marketfoundry.agency>";

/** From for PM / AM / CEO review pings. Pinned so a bad RESEND_FROM_EMAIL cannot 403 staff mail. */
export const MONTHLY_REPORT_STAFF_FROM = "1o8 Hub <reports@marketfoundry.agency>";

interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  from?: string;
  /** Extra SMTP headers, e.g. X-Entity-Ref-ID so Gmail does not thread. */
  headers?: Record<string, string>;
}

export function resolvedFromAddress(from?: string): string {
  return from || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
}

export async function sendResendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  cc,
  from,
  headers,
}: EmailParams): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  const recipients = Array.isArray(to) ? to : [to];
  const copies = cc == null ? [] : Array.isArray(cc) ? cc : [cc];
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolvedFromAddress(from),
        to: recipients,
        subject,
        html,
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(copies.length > 0 ? { cc: copies } : {}),
        ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Resend error:", res.status, err);
      return { ok: false, error: err.replace(/\s+/g, " ").trim().slice(0, 240) || `Resend HTTP ${res.status}` };
    }
    const payload = await res.json().catch(() => ({})) as { id?: unknown };
    return {
      ok: true,
      ...(typeof payload.id === "string" ? { id: payload.id } : {}),
    };
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send email" };
  }
}

/**
 * Send an email via Resend API.
 * Requires RESEND_API_KEY env var.
 * Falls back silently if not configured (logs warning).
 */
export async function sendEmail({ to, subject, html, text, replyTo, from }: EmailParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email");
    return false;
  }
  const result = await sendResendEmail({ to, subject, html, text, replyTo, from });
  return result.ok;
}

interface OnboardingEmailOpts {
  portalUrl?: string;
  driveFolderUrl?: string;
  asanaUrl?: string;
}

/** Onboarding welcome email — based on docs/onboarding-email.md template */
export function buildOnboardingEmail(clientName: string, opts: OnboardingEmailOpts = {}) {
  const portalUrl = opts.portalUrl || "https://www.marketfoundryhub.com/portal";
  const driveLink = opts.driveFolderUrl
    ? `<a href="${opts.driveFolderUrl}" style="color: #F8BF1D;">Client Resources folder</a>`
    : "Client Resources folder";
  const asanaLine = opts.asanaUrl
    ? `<p style="margin: 12px 0 0;">→ <a href="${opts.asanaUrl}" style="color: #F8BF1D;">View your project timeline in Asana</a></p>`
    : "";

  return {
    subject: `Welcome to 1o8 — Let's Get Started, ${clientName}!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 22px; color: #F8BF1D;">Welcome to 1o8</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0; font-size: 14px; line-height: 1.6;">
          <p>Hi ${clientName},</p>
          <p>We are beyond excited to have you on board and can't wait to begin this incredible journey together. Our goal is to elevate your brand and achieve exceptional results, and we are here to support you every step of the way!</p>

          <h2 style="color: #F8BF1D; font-size: 16px; margin: 24px 0 12px;">1. Strategic Optimizations</h2>
          <p>You can expect significant optimizations to help your brand shine on Amazon:</p>
          <ul style="padding-left: 20px; margin: 8px 0;">
            <li style="margin-bottom: 6px;"><strong>Full SEO Optimization</strong> — We will optimize your product listings — including titles, bullet points, and descriptions — to enhance visibility and conversion.</li>
            <li style="margin-bottom: 6px;"><strong>Listing Enhancements</strong> — We will ensure all optimized content and designs are updated on your product detail pages and work with you to complete any missing catalog attributes.</li>
            <li style="margin-bottom: 6px;"><strong>Complete Design Overhaul</strong> — Our creative team will develop high-quality visuals, including a fully designed Storefront, Brand Story, A+ Content, and product images.</li>
            <li style="margin-bottom: 6px;"><strong>PPC Setup &amp; Optimization</strong> — Our experts will implement a full-funnel PPC strategy to capture customers at every stage of the purchasing decision.</li>
            <li style="margin-bottom: 6px;"><strong>Reporting and Communication</strong> — You will receive Amazon Seller Central reports and monthly reporting, supplemented by bi-weekly or monthly overview meetings.</li>
          </ul>

          <h2 style="color: #F8BF1D; font-size: 16px; margin: 24px 0 12px;">2. The 1o8 Portal</h2>
          <p>The 1o8 Portal is your centralized hub for managing every aspect of your Amazon presence. You will receive login access to the app, where you will find:</p>
          <ul style="padding-left: 20px; margin: 8px 0;">
            <li style="margin-bottom: 6px;"><strong>Timeline</strong> — A visual project roadmap showing our 90-day strategy, daily tasks, and key milestones.</li>
            <li style="margin-bottom: 6px;"><strong>Sales</strong> — Real-time dashboards with sales metrics, forecasts, and inventory health.</li>
            <li style="margin-bottom: 6px;"><strong>Products</strong> — The "source of truth" for all your Amazon catalog.</li>
            <li style="margin-bottom: 6px;"><strong>SEO</strong> — Track listing optimization progress through our multi-phase pipeline.</li>
            <li style="margin-bottom: 6px;"><strong>Design</strong> — Review and approve all creative assets with inline commenting.</li>
            <li style="margin-bottom: 6px;"><strong>Reports</strong> — Monthly performance reports, export data, and historical trends.</li>
            <li style="margin-bottom: 6px;"><strong>Finance</strong> — Amazon financial statements, settlement breakdowns, and revenue attribution.</li>
          </ul>
          <p style="margin: 12px 0 0;">→ <a href="${portalUrl}" style="color: #F8BF1D;">Access your 1o8 Portal</a></p>
          ${asanaLine}

          <h2 style="color: #F8BF1D; font-size: 16px; margin: 24px 0 12px;">3. Onboarding Requirements</h2>
          <p>To ensure a seamless setup, please share the following assets:</p>
          <ul style="padding-left: 20px; margin: 8px 0;">
            <li style="margin-bottom: 6px;">Product images, videos, and brand logos.</li>
            <li style="margin-bottom: 6px;">Login credentials for relevant tools and brand guidelines.</li>
            <li style="margin-bottom: 6px;"><strong>Brand Registry Access</strong> — Please grant access so we can manage your assets and support your Amazon account operations effectively.</li>
          </ul>
          <p>Please add these materials to the ${driveLink} or share them directly with us.</p>

          <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;" />
          <p>We are dedicated to making your project as productive as possible. If you have any questions, please don&rsquo;t hesitate to reach out. We look forward to working together!</p>
          <p style="margin-top: 16px;">Best regards,<br/>Jake, Aqib and Team</p>
        </div>
      </div>
    `,
  };
}

/** Email when a user submits new support ticket */
export function buildNewReportEmail(report: {
  id: number;
  ticketNumber?: string;
  reportedByName: string | null;
  reportedBy: string;
  section: string;
  description: string;
}) {
  const reporter = report.reportedByName || report.reportedBy;
  const ticketLabel = report.ticketNumber ?? `#${report.id}`;
  return {
    subject: `[1o8 Hub] New Ticket ${ticketLabel} — ${report.section}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 20px; color: #F8BF1D;">New Support Ticket</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px 0; color: #999; width: 100px;">Ticket</td><td style="padding: 6px 0; font-weight: 600;">${ticketLabel}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Reporter</td><td style="padding: 6px 0;">${reporter}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Section</td><td style="padding: 6px 0;"><code style="background: #333; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${report.section}</code></td></tr>
          </table>
          <div style="background: #252525; border-radius: 8px; padding: 16px; margin-top: 8px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Description</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${report.description}</p>
          </div>
          <p style="margin: 20px 0 0; font-size: 12px; color: #666;">
            <a href="https://www.marketfoundryhub.com/admin/support" style="color: #F8BF1D;">View in 1o8 Hub →</a>
          </p>
        </div>
      </div>
    `,
  };
}

/** Email when A+ comment is posted */
export function buildAplusCommentEmail(comment: {
  authorName: string | null;
  authorEmail: string;
  productName: string;
  productId: string;
  body: string;
  audience: string;
  commentNumber: number | null;
}) {
  const author = comment.authorName || comment.authorEmail;
  const tag = comment.audience === "client" ? " [Client]" : "";
  const numberLabel = comment.commentNumber ? ` #${comment.commentNumber}` : "";
  return {
    subject: `[1o8 Hub] A+ Comment${numberLabel}${tag} on ${comment.productName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 20px; color: #F8BF1D;">New A+ Comment${tag}</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px 0; color: #999; width: 100px;">Product</td><td style="padding: 6px 0; font-weight: 600;">${comment.productName}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">From</td><td style="padding: 6px 0;">${author}</td></tr>
          </table>
          <div style="background: #252525; border-radius: 8px; padding: 16px; margin-top: 8px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Comment</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${comment.body}</p>
          </div>
          <p style="margin: 20px 0 0; font-size: 12px; color: #666;">
            <a href="https://www.marketfoundryhub.com/design/aplus2" style="color: #F8BF1D;">View in 1o8 Hub →</a>
          </p>
        </div>
      </div>
    `,
  };
}

/** Email when feedback status is updated */
export function buildStatusUpdateEmail(report: {
  id: number;
  section: string;
  description: string;
  status: string;
  adminNotes: string | null;
}) {
  const statusLabels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    waiting: "Waiting",
    escalated: "Escalated",
    resolved: "Resolved",
    closed: "Closed",
  };
  const statusColors: Record<string, string> = {
    open: "#3b82f6",
    in_progress: "#f59e0b",
    waiting: "#a855f7",
    escalated: "#ef4444",
    resolved: "#10b981",
    closed: "#71717a",
  };

  const label = statusLabels[report.status] || report.status;
  const color = statusColors[report.status] || "#999";

  return {
    subject: `[1o8 Hub] Feedback #${report.id} updated to ${label}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 20px; color: #F8BF1D;">Feedback Status Updated</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px 0; color: #999; width: 100px;">Report #</td><td style="padding: 6px 0; font-weight: 600;">${report.id}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Section</td><td style="padding: 6px 0;"><code style="background: #333; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${report.section}</code></td></tr>
            <tr><td style="padding: 6px 0; color: #999;">New Status</td><td style="padding: 6px 0;"><span style="background: ${color}22; color: ${color}; padding: 3px 10px; border-radius: 6px; font-size: 13px; font-weight: 600;">${label}</span></td></tr>
          </table>
          <div style="background: #252525; border-radius: 8px; padding: 16px; margin-top: 8px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Your Report</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5; max-height: 80px; overflow: hidden;">${report.description}</p>
          </div>
          ${report.adminNotes ? `
          <div style="background: #252525; border-radius: 8px; padding: 16px; margin-top: 12px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Developer Comments</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${report.adminNotes}</p>
          </div>
          ` : ""}
          <p style="margin: 20px 0 0; font-size: 12px; color: #666;">
            This is an automated notification from <a href="https://www.marketfoundryhub.com" style="color: #F8BF1D;">1o8 Hub</a>.
          </p>
        </div>
      </div>
    `,
  };
}

/**
 * Escape text for safe interpolation into an HTML email body.
 *
 * NOTE: the older builders in this file interpolate user text unescaped.
 * New builders must use this. Ampersand is replaced first so that the
 * entities introduced by later replacements are not double-escaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface TimeOffEmailRequest {
  requesterName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
}

export interface TimeOffEmailDecision {
  status: "approved" | "denied" | "cancelled";
  startDate: string;
  endDate: string;
  workingDays: number;
  decisionNote: string | null;
}

const HUB_URL = "https://www.marketfoundryhub.com";

/** Sent to the approver when a team member submits a request. */
export function buildTimeOffRequestEmail(r: TimeOffEmailRequest) {
  const name = escapeHtml(r.requesterName);
  const reason = escapeHtml(r.reason);
  const dayLabel = r.workingDays === 1 ? "working day" : "working days";

  return {
    subject: `[1o8 Hub] Time-off request from ${r.requesterName} — ${r.startDate} to ${r.endDate}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 20px; color: #F8BF1D;">Time-Off Request</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px 0; color: #999; width: 110px;">From</td><td style="padding: 6px 0; font-weight: 600;">${name}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Dates</td><td style="padding: 6px 0;">${r.startDate} &rarr; ${r.endDate}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Length</td><td style="padding: 6px 0;">${r.workingDays} ${dayLabel}</td></tr>
          </table>
          <div style="background: #252525; border-radius: 8px; padding: 16px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Reason</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${reason}</p>
          </div>
          <p style="margin: 20px 0 0; font-size: 13px;">
            <a href="${HUB_URL}/calendar/requests" style="color: #F8BF1D;">Review this request &rarr;</a>
          </p>
        </div>
      </div>
    `,
  };
}

// DESIGN.md:86-87 brand tokens: --brand-green #34C759 "Success, approved",
// --brand-red #FF5C5F "Error, destructive". Hardcoded because email clients
// do not support CSS custom properties.
const LABELS = {
  approved: "Approved",
  denied: "Denied",
  cancelled: "Revoked",
} as const;
const COLORS = {
  approved: "#34C759",
  denied: "#FF5C5F",
  cancelled: "#FF5C5F",
} as const;
const SUBJECT_VERBS = {
  approved: "approved",
  denied: "denied",
  cancelled: "revoked",
} as const;

/** Sent to the requester once the approver decides. */
export function buildTimeOffDecisionEmail(r: TimeOffEmailDecision) {
  const label = LABELS[r.status];
  const color = COLORS[r.status];
  const dayLabel = r.workingDays === 1 ? "working day" : "working days";
  const noteBlock = r.decisionNote
    ? `<div style="background: #252525; border-radius: 8px; padding: 16px; margin-top: 12px;">
            <p style="margin: 0 0 4px; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Note from your approver</p>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${escapeHtml(r.decisionNote)}</p>
          </div>`
    : "";

  return {
    subject: `[1o8 Hub] Your time off was ${SUBJECT_VERBS[r.status]} — ${r.startDate} to ${r.endDate}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #565454; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 20px; color: #F8BF1D;">Time Off ${label}</h1>
        </div>
        <div style="background: #1a1a1a; padding: 24px; border-radius: 0 0 12px 12px; color: #e0e0e0;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr><td style="padding: 6px 0; color: #999; width: 110px;">Outcome</td><td style="padding: 6px 0;"><span style="background: ${color}22; color: ${color}; padding: 3px 10px; border-radius: 6px; font-size: 13px; font-weight: 600;">${label}</span></td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Dates</td><td style="padding: 6px 0;">${r.startDate} &rarr; ${r.endDate}</td></tr>
            <tr><td style="padding: 6px 0; color: #999;">Length</td><td style="padding: 6px 0;">${r.workingDays} ${dayLabel}</td></tr>
          </table>
          ${noteBlock}
          <p style="margin: 20px 0 0; font-size: 13px;">
            <a href="${HUB_URL}/calendar/requests" style="color: #F8BF1D;">View your requests &rarr;</a>
          </p>
        </div>
      </div>
    `,
  };
}
