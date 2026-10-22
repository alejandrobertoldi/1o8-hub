import type { Report, Direction, KPI, CampaignStat, MoMTableRow } from "@/components/monthly-report/types";
import { escapeHtml } from "@/lib/email";
import { resolvePeriod } from "./period";

/** Gmail clips HTML over this size and hides the rest behind "View entire message". */
export const GMAIL_HTML_BYTE_LIMIT = 102 * 1024;

/** Public origin for logos. Never localhost — Gmail cannot fetch the sender's machine. */
export const MONTHLY_REPORT_EMAIL_ASSET_ORIGIN = "https://www.marketfoundryhub.com";

const CHARCOAL = "#2C2B35";
const GHOST = "#F4F4F2";
const WHITE = "#FEFEFE";
const INK = "#2C2B35";
const MUTED = "#6E6C77";
const LINE = "#D8D7DC";
const UP = "#18864B";
const DOWN = "#C73737";

/** Subject line for the client email. */
export function monthlyReportEmailSubject(opts: {
  client: string;
  month?: string | null;
}): string {
  const client = opts.client.trim() || "Monthly report";
  const month = opts.month?.trim();
  return month ? `${client} — ${month} performance` : `${client} monthly report`;
}

export type MonthlyReportEmailInput = {
  report: Report;
  /** YYYY-MM — used to deep-link the portal HTML report. */
  period: string;
  clientIdCode?: string | null;
  /** Unique per send so Gmail does not thread and hide the body. */
  threadId?: string | null;
  /** Report row createdAt — issued date is generation day, not regen day. */
  issuedAt?: Date | string | null;
};

/** Public portal URL for the full HTML report. Never Drive or localhost. */
export function monthlyReportPortalUrl(opts: {
  clientIdCode?: string | null;
  period: string;
}): string {
  const params = new URLSearchParams();
  params.set("period", opts.period);
  const client = (opts.clientIdCode ?? "").trim();
  if (client) params.set("client", client);
  return `${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}/portal/reports/monthly?${params.toString()}`;
}

export type MonthlyReportEmail = {
  subject: string;
  html: string;
  text: string;
};

function directionColor(direction: string | undefined): string {
  if (direction === "up") return UP;
  if (direction === "down") return DOWN;
  return MUTED;
}

function letterNoteHtml(report: Report, sectionId: "kpis" | "campaigns" | "highlights"): string {
  const note = report.sectionComments?.[sectionId];
  const text = note?.text?.trim();
  if (!note || !text) return "";
  const by = note.authorName?.trim();
  return `<div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${CHARCOAL};background:${GHOST};">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};">Note</div>
    <div style="font-size:13px;line-height:1.5;color:${INK};padding-top:6px;">${escapeHtml(text).replace(/\n/g, "<br>")}</div>
    ${by ? `<div style="font-size:12px;color:${MUTED};padding-top:6px;">${escapeHtml(by)}</div>` : ""}
  </div>`;
}

function logoUrl(path: string): string {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${MONTHLY_REPORT_EMAIL_ASSET_ORIGIN}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

function statCell(label: string, value: string, foot?: string): string {
  return `<td width="50%" valign="top" style="padding:10px 12px;border:1px solid ${LINE};background:${GHOST};">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div>
    <div style="font-size:20px;font-weight:700;color:${INK};line-height:1.3;padding-top:4px;">${escapeHtml(value)}</div>
    ${foot ? `<div style="font-size:12px;color:${MUTED};padding-top:2px;">${escapeHtml(foot)}</div>` : ""}
  </td>`;
}

function pairRows(cells: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const second = cells[i + 1] ?? `<td width="50%" style="padding:0;border:0;"></td>`;
    rows.push(`<tr>${cells[i]}${second}</tr>`);
  }
  return rows.join("");
}

const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** e.g. 2026-07 → { current: "Jul 2026", previous: "Jun 2026" } */
export function comparisonMonthLabels(period: string, fallbackCurrent: string): {
  current: string;
  previous: string;
} {
  try {
    const p = resolvePeriod(period);
    const short = (isoDate: string) => {
      const [y, m] = isoDate.split("-").map(Number);
      return `${SHORT_MONTH[m - 1]} ${y}`;
    };
    return { current: short(p.start), previous: short(p.prevStart) };
  } catch {
    return { current: fallbackCurrent, previous: "Prev" };
  }
}

const MOM_ALIASES: Record<string, string[]> = {
  "Product sales": ["Sales"],
  "Units ordered": ["Units"],
  "Avg. sales/order": ["AOV"],
};

function prevForKpi(kpi: KPI, mom: MoMTableRow[] | undefined): string {
  if (kpi.prev) return kpi.prev;
  const names = [kpi.label, ...(MOM_ALIASES[kpi.label] ?? [])];
  const row = mom?.find((r) => names.includes(r.metric));
  return row?.prev ?? "—";
}

export function formatIssuedDate(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** ▼ down / ▲ up, no space — ▼47, ▲0.03. Flat and em-dash stay plain. */
export function momDeltaLabel(delta: string, direction?: Direction): string {
  const value = delta.trim();
  if (!value || value === "—") return value || "—";
  if (direction === "up") return `▲${value}`;
  if (direction === "down") return `▼${value}`;
  return value;
}

const WHOLE_DOLLAR = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** `$1,500.00` / `$100.60` → `$1,500` / `$101`. Leaves ACoS and compact `$1.5K` alone. */
export function wholeDollarLabel(value: string): string {
  const m = /^\$([0-9,]+)\.(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const n = Number(m[1].replace(/,/g, "")) + Number(m[2]) / 100;
  if (!Number.isFinite(n)) return value;
  return WHOLE_DOLLAR.format(Math.round(n));
}

function comparisonHeader(current: string, previous: string): string {
  const th = `padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};text-align:right;white-space:nowrap;`;
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid ${LINE};"></td>
    <td style="${th}">${escapeHtml(current)}</td>
    <td style="${th}">${escapeHtml(previous)}</td>
    <td style="${th}">MoM</td>
  </tr>`;
}

function comparisonRow(opts: {
  label: string;
  current: string;
  previous: string;
  delta: string;
  direction?: Direction;
}): string {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${INK};">${escapeHtml(opts.label)}</td>
    <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};font-size:13px;font-weight:700;color:${INK};text-align:right;white-space:nowrap;">${escapeHtml(opts.current)}</td>
    <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};font-size:13px;color:${INK};text-align:right;white-space:nowrap;">${escapeHtml(opts.previous)}</td>
    <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};font-size:12px;color:${directionColor(opts.direction)};text-align:right;white-space:nowrap;">${escapeHtml(momDeltaLabel(opts.delta, opts.direction))}</td>
  </tr>`;
}

function comparisonTable(
  rows: Array<{ label: string; current: string; previous: string; delta: string; direction?: Direction }>,
  currentHeader: string,
  previousHeader: string,
): string {
  if (rows.length === 0) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">
    ${comparisonHeader(currentHeader, previousHeader)}
    ${rows.map((row) => comparisonRow(row)).join("")}
  </table>`;
}

export function buildMonthlyReportEmail(input: MonthlyReportEmailInput): MonthlyReportEmail {
  const { report } = input;
  const meta = report.meta;
  const subject = monthlyReportEmailSubject({ client: meta.client, month: meta.month });
  // Square M mark only. Gmail iOS crops the first image into a circle; the stacked
  // wordmark (M + "market foundry") reads as a letter. Match width/height — no width:auto.
  const mfLogo = logoUrl("/1o8_Mark_Ink.png");
  // Set by build-report-data only when Drive has a logo for the client.
  const clientLogoPath = meta.clientLogoUrl?.startsWith("/client-logos/") ? meta.clientLogoUrl : null;
  const clientLogo = clientLogoPath ? logoUrl(clientLogoPath) : null;

  const headline = (report.execSummary?.headlineStats ?? []).slice(0, 4);
  const kpis = (report.kpis ?? []).slice(0, 6);
  const campaignStats = (report.campaigns?.stats ?? []).slice(0, 4).map((s) => ({
    ...s,
    value: wholeDollarLabel(s.value),
    prev: s.prev ? wholeDollarLabel(s.prev) : s.prev,
    delta: s.delta ? wholeDollarLabel(s.delta) : s.delta,
  }));
  const highlights = (report.highlights ?? []).slice(0, 3);
  const lede = report.execSummary?.lede?.trim() ?? "";
  const opener = `Your ${meta.month} Amazon performance snapshot is ready. Headline numbers are below. Click for more details to view the full report in your portal.`;
  const months = comparisonMonthLabels(input.period, meta.month);
  const issued = formatIssuedDate(input.issuedAt) ?? meta.issued;

  const headlineRows = pairRows(
    headline.map((s) => statCell(s.label, s.value, s.foot)),
  );
  const kpiTable = comparisonTable(
    kpis.map((k) => ({
      label: k.label,
      current: k.value,
      previous: prevForKpi(k, report.mom?.table),
      delta: k.delta,
      direction: k.direction,
    })),
    months.current,
    months.previous,
  );
  const campaignTable = comparisonTable(
    campaignStats.map((s: CampaignStat) => ({
      label: s.label,
      current: s.value,
      previous: s.prev ?? "—",
      delta: s.delta ?? "—",
      direction: s.direction,
    })),
    months.current,
    months.previous,
  );

  const highlightBlocks = highlights.map((h) => `<tr>
    <td style="padding:10px 0;border-bottom:1px solid ${LINE};">
      <div style="font-size:14px;font-weight:700;color:${INK};">${escapeHtml(h.title)}</div>
      <div style="font-size:13px;color:${MUTED};padding-top:4px;line-height:1.5;">${escapeHtml(h.body)}</div>
    </td>
  </tr>`).join("");

  const clientIdCode = (input.clientIdCode ?? meta.clientIdCode ?? "").trim();
  const periodKey = input.period.trim();
  const detailsHref = periodKey
    ? monthlyReportPortalUrl({ clientIdCode, period: periodKey })
    : "";
  const cta = detailsHref
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px;">
        <tr>
          <td bgcolor="${CHARCOAL}" style="border-radius:6px;">
            <a href="${escapeHtml(detailsHref)}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:${WHITE};text-decoration:none;">Click for more details</a>
          </td>
        </tr>
      </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${GHOST};">
${input.threadId?.trim() ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${GHOST};">${escapeHtml(input.threadId.trim())}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GHOST};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${WHITE};border:1px solid ${LINE};">
        <tr>
          <td bgcolor="${CHARCOAL}" style="padding:20px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <img src="${mfLogo}" alt="1o8" width="56" height="56" style="display:block;border:0;width:56px;height:56px;">
                </td>
                ${clientLogo ? `<td align="right" valign="middle"><img src="${escapeHtml(clientLogo)}" alt="${escapeHtml(meta.client)}" height="40" style="display:block;border:0;height:40px;width:auto;"></td>` : ""}
              </tr>
            </table>
            <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${WHITE};">Monthly performance</p>
            <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:${WHITE};line-height:1.25;">${escapeHtml(meta.client)} · ${escapeHtml(meta.month)}</p>
            <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${WHITE};">${escapeHtml(meta.period)}${issued ? ` · Issued ${escapeHtml(issued)}` : ""}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
            <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:${INK};">
              ${escapeHtml(opener)}
            </p>
            ${lede ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:${INK};">${escapeHtml(lede)}</p>` : ""}
            ${headlineRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">${headlineRows}</table>` : ""}
            ${kpiTable ? `<p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};">KPIs</p>
            ${kpiTable}
            ${letterNoteHtml(report, "kpis")}` : ""}
            ${campaignTable ? `<p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};">Advertising</p>
            ${campaignTable}
            ${letterNoteHtml(report, "campaigns")}` : ""}
            ${highlightBlocks ? `<p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};">Highlights</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px;">${highlightBlocks}</table>
            ${letterNoteHtml(report, "highlights")}` : ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 4px;">
                  ${cta}
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-size:14px;line-height:1.5;">
              Thank you,<br>
              <strong>${escapeHtml(meta.lead || "The 1o8 team")}</strong><br>
              <span style="color:${MUTED};font-size:12px;">1o8</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${MUTED};">
            This letter is a snapshot. Click for more details to view charts, SKU detail, and commentary in your portal.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textLines = [
    opener,
    lede,
    "",
    `${meta.client} — ${meta.month} performance`,
    "",
    ...headline.map((s) => `${s.label}: ${s.value} ${s.foot}`.trim()),
    ...kpis.map((k) => `${k.label}: ${k.value} / ${prevForKpi(k, report.mom?.table)} (${momDeltaLabel(k.delta, k.direction)})`),
    report.sectionComments?.kpis?.text ? `Note: ${report.sectionComments.kpis.text}` : "",
    ...campaignStats.map((s) => `${s.label}: ${s.value} / ${s.prev ?? "—"} (${momDeltaLabel(s.delta ?? "—", s.direction)})`),
    report.sectionComments?.campaigns?.text ? `Note: ${report.sectionComments.campaigns.text}` : "",
    ...highlights.map((h) => `• ${h.title} — ${h.body}`),
    report.sectionComments?.highlights?.text ? `Note: ${report.sectionComments.highlights.text}` : "",
    "",
    detailsHref ? `Click for more details: ${detailsHref}` : "",
    "",
    `Thank you,\n${meta.lead || "The 1o8 team"}\n1o8`,
  ].filter((line) => line !== undefined);

  return {
    subject,
    html,
    text: textLines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n").trim(),
  };
}
