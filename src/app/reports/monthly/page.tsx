/* eslint-disable react-doctor/rendering-hydration-no-flicker */
/* eslint-disable react-doctor/nextjs-no-client-fetch-for-server-data */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { Report as ReportView } from "@/components/monthly-report/Report";
import type { Report as ReportData, SectionId } from "@/components/monthly-report/types";
import type { SectionKey } from "@/lib/monthly-report";
import { PageMetaSlot, PageSubnavSlot } from "@/components/layout/page-header-slot";
import { TocNav } from "@/components/monthly-report/shell/TocNav";
import { parseGenerateHttpBody } from "@/lib/monthly-report/parse-generate-response";
import { lastCompletedMonth } from "@/lib/monthly-report/period";
import {
  canComment,
  canSend,
  isWaitingForReviewer,
  reviewPermissions,
  reviewStatusLabel,
} from "@/lib/monthly-report/review";
import { ReviewPipeline } from "@/components/monthly-report/ReviewPipeline";
import { isEmail, mergeEmails, MAX_CUSTOM_RECIPIENTS } from "@/lib/monthly-report/recipients";

function pad2(n: number) { return String(n).padStart(2, "0"); }

function formatSendStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSendStatus(status: string): string {
  if (status === "delivered") return "Delivered";
  if (status === "bounced") return "Bounced";
  if (status === "complained") return "Complained";
  if (status === "failed") return "Failed";
  if (status === "queued") return "Queued";
  return "Sent";
}

function sendStatusClass(status: string): string {
  if (status === "delivered") return "text-[10px] font-bold uppercase tracking-wider text-brand-green";
  if (status === "bounced" || status === "failed" || status === "complained") {
    return "text-[10px] font-bold uppercase tracking-wider text-brand-red";
  }
  return "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
}

function recentMonths(count: number): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [];
  const latest = lastCompletedMonth();
  const [y, m] = latest.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const dd = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = `${dd.getUTCFullYear()}-${pad2(dd.getUTCMonth() + 1)}`;
    const label = dd.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    result.push({ value, label });
  }
  return result;
}

interface ApiResponse {
  report?: ReportData;
  skipped: SectionKey[];
  createdAt?: string;
  driveUrl?: string;
  htmlUrl?: string;
  status?: string;
  reviewNote?: string | null;
  clientIdCode?: string;
  sentAt?: string | null;
  sentTo?: string[];
  sendError?: string | null;
  sendDelivery?: {
    at: string | null;
    status: string;
    to: string[];
    resendId: string | null;
  } | null;
}

type ListClient = {
  code: string;
  name: string;
  accountId: string | null;
  clientIdCode: string;
  projectManager: string | null;
  accountManager: string | null;
  recipients: string[];
};

type Viewer = {
  name: string | null;
  email: string | null;
  canOverride: boolean;
  canGenerate: boolean;
};

type ReportKey = string; // `${clientIdCode}-${period}`
function makeKey(clientIdCode: string, period: string): ReportKey {
  return `${clientIdCode}-${period}`;
}

const MONTHS = recentMonths(12).filter(m => m.value >= "2026-03");
const DISABLED_STORAGE_KEY = "monthly-reports-disabled-clients";
const DISABLED_RECIPIENTS_KEY = "monthly-reports-disabled-recipients";
const CUSTOM_RECIPIENTS_KEY = "monthly-reports-custom-recipients";

function EnableSwitch({
  checked,
  disabled,
  label,
  title,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      aria-label={label}
      title={title}
      onClick={onToggle}
      className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-brand-solid" : "bg-sidebar-border"}`}
    >
      <span className={`block size-3 rounded-full bg-white transition-transform ${checked ? "translate-x-[11px]" : "translate-x-[1px]"}`} />
    </button>
  );
}

function customRecipientKey(clientIdCode: string, period: string) {
  return `${clientIdCode}:${period}`;
}

function RecipientsEditor({
  book,
  custom,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  isEnabled,
  onToggle,
}: {
  book: string[];
  custom: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (email: string) => void;
  isEnabled: (email: string) => boolean;
  onToggle: (email: string, next: boolean) => void;
}) {
  const bookSet = new Set(book.map((email) => email.toLowerCase()));
  const emails = mergeEmails([...book, ...custom]);
  return (
    <div className="flex flex-col gap-1">
      {emails.map((email) => {
        const on = isEnabled(email);
        const isCustom = !bookSet.has(email.toLowerCase());
        return (
          <div key={email} className="flex items-center gap-1.5 min-w-0">
            <EnableSwitch
              checked={on}
              label={on ? `Disable ${email}` : `Enable ${email}`}
              onToggle={() => onToggle(email, !on)}
            />
            <span
              className={`truncate max-w-[180px] ${on ? "text-sidebar-foreground" : "text-muted-foreground line-through"}`}
              title={email}
            >
              {email}
            </span>
            {isCustom && (
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() => onRemove(email)}
                className="shrink-0 text-muted-foreground hover:text-brand text-[11px] leading-none px-0.5"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {custom.length < MAX_CUSTOM_RECIPIENTS && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAdd();
          }}
          className="flex items-center gap-1"
        >
          <input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Add email"
            className="h-6 w-[160px] rounded border border-sidebar-border bg-background px-1.5 text-[11px]"
            aria-label="Add recipient email"
          />
          <button type="submit" className="shrink-0 text-brand hover:underline font-medium">
            Add
          </button>
        </form>
      )}
    </div>
  );
}

/** Survives Fast Refresh remounts so a 20s generate is not silently dropped. */
const inflightGenerateKeys = new Set<ReportKey>();
const generateUi = {
  setReports: null as Dispatch<SetStateAction<Map<ReportKey, ApiResponse>>> | null,
  setLoading: null as Dispatch<SetStateAction<Set<ReportKey>>> | null,
  setErrors: null as Dispatch<SetStateAction<Map<ReportKey, string>>> | null,
};

function summaryFromListRow(row: {
  clientIdCode?: unknown;
  skipped?: unknown;
  createdAt?: unknown;
  driveUrl?: unknown;
  htmlUrl?: unknown;
  status?: unknown;
  reviewNote?: unknown;
  sentAt?: unknown;
  sentTo?: unknown;
  sendError?: unknown;
  sendDelivery?: unknown;
}, existing?: ApiResponse): ApiResponse {
  const delivery = parseSendDelivery(row.sendDelivery) ?? existing?.sendDelivery ?? null;
  return {
    report: existing?.report,
    skipped: Array.isArray(row.skipped) ? row.skipped as SectionKey[] : existing?.skipped ?? [],
    createdAt: typeof row.createdAt === "string" ? row.createdAt : existing?.createdAt,
    driveUrl: typeof row.driveUrl === "string" ? row.driveUrl : existing?.driveUrl,
    htmlUrl: typeof row.htmlUrl === "string" ? row.htmlUrl : existing?.htmlUrl,
    status: typeof row.status === "string" ? row.status : existing?.status,
    reviewNote: typeof row.reviewNote === "string" ? row.reviewNote : existing?.reviewNote ?? null,
    clientIdCode: typeof row.clientIdCode === "string" ? row.clientIdCode : existing?.clientIdCode,
    sentAt: typeof row.sentAt === "string" ? row.sentAt : existing?.sentAt ?? null,
    sentTo: Array.isArray(row.sentTo) ? row.sentTo.filter((x): x is string => typeof x === "string") : existing?.sentTo,
    sendError: typeof row.sendError === "string" ? row.sendError : existing?.sendError ?? null,
    sendDelivery: delivery,
  };
}

function parseSendDelivery(raw: unknown): ApiResponse["sendDelivery"] {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : null;
  if (!status) return null;
  return {
    at: typeof row.at === "string" ? row.at : null,
    status,
    to: Array.isArray(row.to) ? row.to.filter((x): x is string => typeof x === "string") : [],
    resendId: typeof row.resendId === "string" ? row.resendId : null,
  };
}

function loadDisabledCodes(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch { return new Set(); }
}

function saveDisabledCodes(codes: Set<string>) {
  try { localStorage.setItem(DISABLED_STORAGE_KEY, JSON.stringify([...codes])); }
  catch { /* quota exceeded */ }
}

function loadDisabledRecipients(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(DISABLED_RECIPIENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [code, emails] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(emails)) continue;
      out[code] = emails
        .filter((email): email is string => typeof email === "string")
        .map((email) => email.toLowerCase());
    }
    return out;
  } catch {
    return {};
  }
}

function saveDisabledRecipients(map: Record<string, string[]>) {
  try { localStorage.setItem(DISABLED_RECIPIENTS_KEY, JSON.stringify(map)); }
  catch { /* quota exceeded */ }
}

function loadCustomRecipients(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_RECIPIENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [key, emails] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(emails)) continue;
      out[key] = mergeEmails(emails.filter((email): email is string => typeof email === "string"))
        .slice(0, MAX_CUSTOM_RECIPIENTS);
    }
    return out;
  } catch {
    return {};
  }
}

function saveCustomRecipients(map: Record<string, string[]>) {
  try { localStorage.setItem(CUSTOM_RECIPIENTS_KEY, JSON.stringify(map)); }
  catch { /* quota exceeded */ }
}

export default function MonthlyReportsPage() {
  const [clients, setClients] = useState<ListClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([MONTHS[0]?.value ?? ""]));
  const [reports, setReports] = useState<Map<ReportKey, ApiResponse>>(new Map());
  const [loading, setLoading] = useState<Set<ReportKey>>(new Set());
  const [errors, setErrors] = useState<Map<ReportKey, string>>(new Map());
  const [bulkGenerating, setBulkGenerating] = useState<Set<string>>(new Set()); // keyed by period
  const [bulkKind, setBulkKind] = useState<Map<string, "generate" | "regenerate">>(new Map());
  const [viewing, setViewing] = useState<ReportKey | null>(null);
  const [viewingError, setViewingError] = useState<string | null>(null);
  const [disabledCodes, setDisabledCodes] = useState<Set<string>>(new Set());
  const [disabledRecipients, setDisabledRecipients] = useState<Record<string, string[]>>({});
  const [customRecipients, setCustomRecipients] = useState<Record<string, string[]>>({});
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [asanaUrl, setAsanaUrl] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<"all" | "mine">("all");
  const [sendBackKey, setSendBackKey] = useState<ReportKey | null>(null);
  const [sendBackNote, setSendBackNote] = useState("");
  const [reviewing, setReviewing] = useState<Set<ReportKey>>(new Set());
  const [letterKey, setLetterKey] = useState<ReportKey | null>(null);
  const [letterClient, setLetterClient] = useState<ListClient | null>(null);
  const [letterPeriod, setLetterPeriod] = useState<string | null>(null);
  const [letterPreview, setLetterPreview] = useState<{
    subject: string;
    html: string;
    recipients: string[];
    replyTo: string | null;
    cc: string[];
  } | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [letterSending, setLetterSending] = useState(false);
  const [savingCommentId, setSavingCommentId] = useState<SectionId | null>(null);

  useEffect(() => {
    setDisabledCodes(loadDisabledCodes());
    setDisabledRecipients(loadDisabledRecipients());
    setCustomRecipients(loadCustomRecipients());
  }, []);

  useEffect(() => {
    generateUi.setReports = setReports;
    generateUi.setLoading = setLoading;
    generateUi.setErrors = setErrors;
  });

  useEffect(() => {
    if (inflightGenerateKeys.size === 0) return;
    setLoading(prev => {
      const next = new Set(prev);
      for (const k of inflightGenerateKeys) next.add(k);
      return next;
    });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/reports/monthly", { signal: ac.signal })
      .then(r => r.json())
      .then(j => {
        if (ac.signal.aborted) return;
        setClients((j.clients ?? []).map((c: ListClient) => ({
          code: c.code,
          name: c.name,
          accountId: c.accountId ?? null,
          clientIdCode: c.clientIdCode,
          projectManager: c.projectManager ?? null,
          accountManager: c.accountManager ?? null,
          recipients: Array.isArray(c.recipients)
            ? c.recipients.filter((email): email is string => typeof email === "string")
            : [],
        })));
        if (typeof j.asanaUrl === "string") setAsanaUrl(j.asanaUrl);
        if (j.viewer && typeof j.viewer === "object") {
          const nextViewer: Viewer = {
            name: typeof j.viewer.name === "string" ? j.viewer.name : null,
            email: typeof j.viewer.email === "string" ? j.viewer.email : null,
            canOverride: Boolean(j.viewer.canOverride),
            canGenerate: Boolean(j.viewer.canGenerate),
          };
          setViewer(nextViewer);
          if (!nextViewer.canOverride) setQueueFilter("mine");
        }
        setReports(prev => {
          const next = new Map(prev);
          for (const row of j.reports ?? []) {
            if (typeof row?.clientIdCode !== "string" || typeof row?.period !== "string") continue;
            const key = makeKey(row.clientIdCode, row.period);
            next.set(key, summaryFromListRow(row, next.get(key)));
          }
          return next;
        });
      })
      .catch(err => {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        setClients([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setClientsLoading(false);
      });
    return () => ac.abort();
  }, []);

  function toggleMonth(value: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }

  const refetchSummaries = useCallback(async () => {
    const res = await fetch("/api/reports/monthly");
    if (!res.ok) return;
    const j = await res.json();
    generateUi.setReports?.(prev => {
      const next = new Map(prev);
      for (const row of j.reports ?? []) {
        if (typeof row?.clientIdCode !== "string" || typeof row?.period !== "string") continue;
        const key = makeKey(row.clientIdCode, row.period);
        next.set(key, summaryFromListRow(row, next.get(key)));
      }
      return next;
    });
  }, []);

  const generate = useCallback(async (
    clientCode: string,
    period: string,
    clientIdCode: string,
    opts?: { skipPmNotify?: boolean },
  ) => {
    const key = makeKey(clientIdCode, period);
    if (inflightGenerateKeys.has(key)) {
      generateUi.setLoading?.(prev => new Set(prev).add(key));
      return;
    }
    inflightGenerateKeys.add(key);
    generateUi.setLoading?.(prev => new Set(prev).add(key));
    generateUi.setErrors?.(prev => { const m = new Map(prev); m.delete(key); return m; });
    try {
      const res = await fetch("/api/reports/monthly", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientCode, period, skipPmNotify: opts?.skipPmNotify === true }),
      });
      const parsed = parseGenerateHttpBody(res.status, await res.text());
      if (!parsed.ok) {
        generateUi.setErrors?.(prev => new Map(prev).set(key, parsed.error));
        return;
      }
      const body = parsed.body;
      generateUi.setReports?.(prev => {
        const existing = prev.get(key);
        const next = new Map(prev);
        next.set(key, {
          report: existing?.report,
          skipped: Array.isArray(body.skipped) ? body.skipped as SectionKey[] : [],
          createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
          driveUrl: typeof body.driveUrl === "string" ? body.driveUrl : undefined,
          htmlUrl: typeof body.htmlUrl === "string" ? body.htmlUrl : undefined,
          status: typeof body.status === "string" ? body.status : "generated",
          reviewNote: null,
          clientIdCode,
        });
        return next;
      });
      await refetchSummaries();
    } catch (err) {
      generateUi.setErrors?.(prev => new Map(prev).set(key, err instanceof Error ? err.message : "Network error"));
    } finally {
      inflightGenerateKeys.delete(key);
      generateUi.setLoading?.(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [refetchSummaries]);

  const generateAll = useCallback(async (
    period: string,
    clientList: ListClient[],
    opts?: { force?: boolean },
  ) => {
    const kind = opts?.force ? "regenerate" : "generate";
    setBulkGenerating(prev => new Set(prev).add(period));
    setBulkKind(prev => new Map(prev).set(period, kind));
    try {
      const queue = clientList
        .filter(c => c.accountId && !disabledCodes.has(c.code))
        .filter(c => {
          const has = reports.has(makeKey(c.clientIdCode, period));
          return opts?.force ? has : !has;
        });
      for (const c of queue) {
        await generate(c.code, period, c.clientIdCode, { skipPmNotify: true });
      }
      if (queue.length > 0) {
        await fetch("/api/reports/monthly", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            period,
            pmDigestClientCodes: queue.map((c) => c.clientIdCode),
          }),
        });
      }
    } finally {
      setBulkGenerating(prev => { const s = new Set(prev); s.delete(period); return s; });
      setBulkKind(prev => { const m = new Map(prev); m.delete(period); return m; });
    }
  }, [generate, reports, disabledCodes]);

  const openView = useCallback(async (client: ListClient, period: string) => {
    const key = makeKey(client.clientIdCode, period);
    setViewing(key);
    setViewingError(null);
    const existing = reports.get(key);
    if (existing?.report) return;
    try {
      const res = await fetch(
        `/api/reports/monthly?clientCode=${encodeURIComponent(client.clientIdCode)}&period=${encodeURIComponent(period)}`,
      );
      const text = await res.text();
      let json: {
        error?: string;
        report?: ReportData;
        skipped?: SectionKey[];
        createdAt?: string;
        driveUrl?: string;
        htmlUrl?: string;
        status?: string;
        clientIdCode?: string;
        reviewNote?: string | null;
        sentAt?: string | null;
        sentTo?: string[];
      } = {};
      try { json = text ? JSON.parse(text) as typeof json : {}; } catch { /* non-JSON */ }
      if (!res.ok) {
        setViewingError(json.error ?? `Could not load report (${res.status})`);
        return;
      }
      setReports(prev => new Map(prev).set(key, {
        report: json.report,
        skipped: json.skipped ?? [],
        createdAt: json.createdAt,
        driveUrl: json.driveUrl,
        htmlUrl: json.htmlUrl,
        status: json.status,
        clientIdCode: json.clientIdCode ?? client.clientIdCode,
        reviewNote: typeof json.reviewNote === "string" ? json.reviewNote : null,
      }));
    } catch (err) {
      setViewingError(err instanceof Error ? err.message : "Network error");
    }
  }, [reports]);

  const review = useCallback(async (
    client: ListClient,
    period: string,
    action: "approve" | "send_back",
    note?: string,
  ) => {
    const key = makeKey(client.clientIdCode, period);
    setReviewing(prev => new Set(prev).add(key));
    setErrors(prev => { const m = new Map(prev); m.delete(key); return m; });
    try {
      const res = await fetch("/api/reports/monthly", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientCode: client.code, period, action, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(prev => new Map(prev).set(key, typeof json.error === "string" ? json.error : `HTTP ${res.status}`));
        if (typeof json.status === "string") {
          setReports(prev => {
            const current = prev.get(key);
            if (!current) return prev;
            const next = new Map(prev);
            next.set(key, { ...current, status: json.status });
            return next;
          });
        }
        return;
      }
      setReports(prev => {
        const current = prev.get(key);
        if (!current) return prev;
        const next = new Map(prev);
        next.set(key, {
          ...current,
          status: typeof json.status === "string" ? json.status : current.status,
          reviewNote: json.reviewNote ?? null,
        });
        return next;
      });
      setSendBackKey(null);
      setSendBackNote("");
    } catch (err) {
      setErrors(prev => new Map(prev).set(key, err instanceof Error ? err.message : "Network error"));
    } finally {
      setReviewing(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, []);

  const openLetter = useCallback(async (client: ListClient, period: string) => {
    const key = makeKey(client.clientIdCode, period);
    setLetterKey(key);
    setLetterClient(client);
    setLetterPeriod(period);
    setLetterPreview(null);
    setLetterError(null);
    setLetterLoading(true);
    try {
      const res = await fetch(
        `/api/reports/monthly?clientCode=${encodeURIComponent(client.clientIdCode)}&period=${encodeURIComponent(period)}&letter=1`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLetterError(typeof json.error === "string" ? json.error : `Could not load letter (${res.status})`);
        return;
      }
      setLetterPreview({
        subject: typeof json.subject === "string" ? json.subject : "Monthly report",
        html: typeof json.html === "string" ? json.html : "",
        recipients: Array.isArray(json.recipients) ? json.recipients.filter((x: unknown): x is string => typeof x === "string") : [],
        replyTo: typeof json.replyTo === "string" ? json.replyTo : null,
        cc: Array.isArray(json.cc) ? json.cc.filter((x: unknown): x is string => typeof x === "string") : [],
      });
    } catch (err) {
      setLetterError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLetterLoading(false);
    }
  }, []);

  const sendLetter = useCallback(async () => {
    if (!letterClient || !letterPeriod || !letterKey) return;
    const extras = customRecipients[customRecipientKey(letterClient.clientIdCode, letterPeriod)] ?? [];
    const to = mergeEmails([
      ...(letterPreview?.recipients ?? letterClient.recipients),
      ...extras,
    ]).filter((email) =>
      !(disabledRecipients[letterClient.clientIdCode] ?? []).includes(email.toLowerCase()),
    );
    const extraRecipients = extras.filter((email) =>
      !(disabledRecipients[letterClient.clientIdCode] ?? []).includes(email.toLowerCase()),
    );
    if (to.length === 0) {
      setLetterError("No recipients enabled");
      return;
    }
    setLetterSending(true);
    setLetterError(null);
    try {
      const res = await fetch("/api/reports/monthly", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientCode: letterClient.code,
          period: letterPeriod,
          action: "send",
          recipients: to,
          extraRecipients,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLetterError(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        if (typeof json.status === "string") {
          setReports(prev => {
            const current = prev.get(letterKey);
            if (!current) return prev;
            return new Map(prev).set(letterKey, { ...current, status: json.status });
          });
        }
        return;
      }
      setReports(prev => {
        const current = prev.get(letterKey);
        if (!current) return prev;
        return new Map(prev).set(letterKey, {
          ...current,
          status: "sent",
          sentTo: Array.isArray(json.sentTo) ? json.sentTo : current.sentTo,
          sentAt: new Date().toISOString(),
        });
      });
      setLetterKey(null);
      setLetterClient(null);
      setLetterPeriod(null);
      setLetterPreview(null);
    } catch (err) {
      setLetterError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLetterSending(false);
    }
  }, [letterClient, letterPeriod, letterKey, letterPreview, disabledRecipients, customRecipients]);

  const closeLetter = useCallback(() => {
    setLetterKey(null);
    setLetterClient(null);
    setLetterPeriod(null);
    setLetterPreview(null);
    setLetterError(null);
  }, []);

  useEffect(() => {
    if (!letterKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLetter();
    };
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [letterKey, closeLetter]);

  const saveSectionComment = useCallback(async (
    client: ListClient,
    period: string,
    sectionId: SectionId,
    text: string,
  ) => {
    const key = makeKey(client.clientIdCode, period);
    setSavingCommentId(sectionId);
    setViewingError(null);
    try {
      const res = await fetch("/api/reports/monthly", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientCode: client.code,
          period,
          action: "comment",
          sectionId,
          text,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setViewingError(typeof json.error === "string" ? json.error : `Could not save note (${res.status})`);
        return;
      }
      if (json.report && typeof json.report === "object") {
        setReports((prev) => {
          const current = prev.get(key);
          if (!current) return prev;
          const next = new Map(prev);
          next.set(key, { ...current, report: json.report as ReportData });
          return next;
        });
      }
    } catch (err) {
      setViewingError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingCommentId(null);
    }
  }, []);

  function isRecipientEnabled(clientIdCode: string, email: string) {
    return !(disabledRecipients[clientIdCode] ?? []).includes(email.toLowerCase());
  }

  function enabledRecipientsFor(client: ListClient, emails: string[]) {
    return emails.filter((email) => isRecipientEnabled(client.clientIdCode, email));
  }

  function customFor(clientIdCode: string, period: string) {
    return customRecipients[customRecipientKey(clientIdCode, period)] ?? [];
  }

  function allRecipientsFor(client: ListClient, period: string, book = client.recipients) {
    return mergeEmails([...book, ...customFor(client.clientIdCode, period)]);
  }

  function setRecipientEnabled(clientIdCode: string, email: string, enabled: boolean) {
    setDisabledRecipients(prev => {
      const key = email.toLowerCase();
      const current = new Set(prev[clientIdCode] ?? []);
      if (enabled) current.delete(key); else current.add(key);
      const next = { ...prev };
      if (current.size === 0) delete next[clientIdCode];
      else next[clientIdCode] = [...current];
      saveDisabledRecipients(next);
      return next;
    });
  }

  function addCustomRecipient(client: ListClient, period: string) {
    const key = customRecipientKey(client.clientIdCode, period);
    const raw = (customDraft[key] ?? "").trim();
    if (!isEmail(raw)) return;
    const existing = new Set(
      allRecipientsFor(client, period).map((email) => email.toLowerCase()),
    );
    if (existing.has(raw.toLowerCase())) {
      setCustomDraft((prev) => ({ ...prev, [key]: "" }));
      return;
    }
    setCustomRecipients((prev) => {
      const current = prev[key] ?? [];
      if (current.length >= MAX_CUSTOM_RECIPIENTS) return prev;
      const next = { ...prev, [key]: mergeEmails([...current, raw]) };
      saveCustomRecipients(next);
      return next;
    });
    setCustomDraft((prev) => ({ ...prev, [key]: "" }));
  }

  function removeCustomRecipient(clientIdCode: string, period: string, email: string) {
    const key = customRecipientKey(clientIdCode, period);
    setCustomRecipients((prev) => {
      const current = (prev[key] ?? []).filter((item) => item.toLowerCase() !== email.toLowerCase());
      const next = { ...prev };
      if (current.length === 0) delete next[key];
      else next[key] = current;
      saveCustomRecipients(next);
      return next;
    });
  }

  function setClientEnabled(code: string, enabled: boolean) {
    setDisabledCodes(prev => {
      const next = new Set(prev);
      if (enabled) next.delete(code); else next.add(code);
      saveDisabledCodes(next);
      return next;
    });
  }

  function setAllEnabled(enabled: boolean) {
    setDisabledCodes(prev => {
      const next = new Set(prev);
      for (const c of clients) {
        if (!c.accountId) continue;
        if (enabled) next.delete(c.code); else next.add(c.code);
      }
      saveDisabledCodes(next);
      return next;
    });
  }

  // Full-screen report viewer
  const viewingEntry = viewing ? reports.get(viewing) : null;
  const viewingMatch = viewing?.match(/^(.*)-(\d{4}-\d{2})$/);
  const viewingClient = viewingMatch
    ? clients.find((c) => c.clientIdCode === viewingMatch[1])
    : undefined;
  const viewingPeriod = viewingMatch?.[2] ?? null;
  const viewingPerms = reviewPermissions({
    userName: viewer?.name,
    userEmail: viewer?.email,
    projectManager: viewingClient?.projectManager ?? null,
    accountManager: viewingClient?.accountManager ?? null,
    canOverride: viewer?.canOverride ?? false,
  });
  const viewingCommentsEditable = Boolean(viewingClient && canComment(viewingPerms));

  if (viewing) {
    return (
      <div>
        <PageMetaSlot>
          <div className="flex flex-col items-start gap-1.5 min-w-0">
            <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
              <span className="font-bold text-sidebar-foreground">Monthly</span><span className="font-normal text-brand">Report</span>
            </h1>
            <button type="button" onClick={() => { setViewing(null); setViewingError(null); }}
              className="rounded-md border border-sidebar-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent">
              ← All Reports
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/reports/monthly/config"
              className="rounded-md border border-sidebar-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent">
              Configure
            </Link>
          </div>
        </PageMetaSlot>
        {!viewingEntry?.report && viewingError ? (
          <p className="text-sm text-brand-red py-8">{viewingError}</p>
        ) : !viewingEntry?.report ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="size-4 animate-spin" /> Loading report…
          </div>
        ) : (
          <>
            {viewingError && (
              <p className="text-sm text-brand-red py-2">{viewingError}</p>
            )}
            <PageSubnavSlot>
              <TocNav data={viewingEntry.report} variant="chrome" />
            </PageSubnavSlot>
            <ReportView
              data={viewingEntry.report}
              showTopBar={false}
              showToc={false}
              commentsEditable={viewingCommentsEditable}
              savingCommentId={savingCommentId}
              onSaveComment={(sectionId, text) => {
                if (!viewingClient || !viewingPeriod) return;
                void saveSectionComment(viewingClient, viewingPeriod, sectionId, text);
              }}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageMetaSlot>
        <div className="flex items-center gap-3">
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">Monthly</span><span className="font-normal text-brand">Report</span>
          </h1>
        </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-sidebar-border overflow-hidden">
              <button
                type="button"
                onClick={() => setQueueFilter("all")}
                className={`px-2.5 py-1 text-xs ${queueFilter === "all" ? "bg-sidebar-accent text-sidebar-foreground font-medium" : "text-muted-foreground hover:bg-sidebar-accent"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setQueueFilter("mine")}
                className={`px-2.5 py-1 text-xs border-l border-sidebar-border ${queueFilter === "mine" ? "bg-sidebar-accent text-sidebar-foreground font-medium" : "text-muted-foreground hover:bg-sidebar-accent"}`}
              >
                Waiting for me
              </button>
            </div>
            {asanaUrl && (
              <a href={asanaUrl} target="_blank" rel="noopener noreferrer"
                className="rounded-md border border-sidebar-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent">
                Asana task
              </a>
            )}
            {viewer?.canGenerate && (
              <Link href="/reports/monthly/config"
                className="rounded-md border border-sidebar-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent">
                Configure
              </Link>
            )}
          </div>
      </PageMetaSlot>

      {clientsLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="size-4 animate-spin" /> Loading clients…
        </div>
      )}

      <div className="space-y-3">
        {MONTHS.map(month => {
          const isOpen = expanded.has(month.value);
          const enabledClients = clients.filter(c => c.accountId && !disabledCodes.has(c.code));
          const generatedInMonth = enabledClients.filter(c => reports.has(makeKey(c.clientIdCode, month.value))).length;
          const isBulk = bulkGenerating.has(month.value);
          const bulkAction = bulkKind.get(month.value);
          const allGenerated = enabledClients.length > 0 && enabledClients.every(c => reports.has(makeKey(c.clientIdCode, month.value)));
          const toggleable = clients.filter(c => c.accountId);
          const allEnabled = toggleable.length > 0 && toggleable.every(c => !disabledCodes.has(c.code));
          const canRunGenerate = Boolean(viewer?.canGenerate);
          const visibleClients = clients.filter(client => {
            if (queueFilter !== "mine") return true;
            const entry = reports.get(makeKey(client.clientIdCode, month.value));
            if (!entry?.status) return false;
            const perms = reviewPermissions({
              userName: viewer?.name,
              userEmail: viewer?.email,
              projectManager: client.projectManager,
              accountManager: client.accountManager,
              canOverride: viewer?.canOverride ?? false,
            });
            return isWaitingForReviewer(entry.status, perms) || canSend(entry.status, perms);
          });

          return (
            <div key={month.value} className="rounded-lg border border-sidebar-border bg-sidebar-accent/20 overflow-hidden">
              {/* Month header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleMonth(month.value)}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  {isOpen
                    ? <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  }
                  <span className="text-sm font-semibold text-sidebar-foreground">{month.label}</span>
                </button>
                {enabledClients.length > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {generatedInMonth}/{enabledClients.length} generated
                    {enabledClients.length !== clients.length && (
                      <span className="text-sidebar-border"> · {clients.length} total</span>
                    )}
                  </span>
                )}
                {canRunGenerate && generatedInMonth > 0 && (
                  <button
                    type="button"
                    onClick={() => { if (!isOpen) toggleMonth(month.value); generateAll(month.value, clients, { force: true }); }}
                    disabled={isBulk || clientsLoading}
                    className={allGenerated
                      ? "rounded-md bg-brand-solid px-3 py-1 text-xs font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_12px_-4px_var(--brand-glow)] disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                      : "rounded-md border border-sidebar-border px-3 py-1 text-xs font-bold text-sidebar-foreground hover:border-brand hover:text-brand disabled:opacity-50 flex items-center gap-1.5 shrink-0"}
                  >
                    {isBulk && bulkAction === "regenerate" && <Loader2 className="size-3 animate-spin" />}
                    {isBulk && bulkAction === "regenerate" ? "Regenerating…" : "Regenerate All"}
                  </button>
                )}
                {canRunGenerate && !allGenerated && enabledClients.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { if (!isOpen) toggleMonth(month.value); generateAll(month.value, clients); }}
                    disabled={isBulk || clientsLoading}
                    className="rounded-md bg-brand-solid px-3 py-1 text-xs font-bold text-white hover:bg-brand-solid-hover shadow-[0_0_12px_-4px_var(--brand-glow)] disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {isBulk && bulkAction === "generate" && <Loader2 className="size-3 animate-spin" />}
                    {isBulk && bulkAction === "generate" ? "Generating…" : "Generate All"}
                  </button>
                )}
              </div>

              {/* Clients table */}
              {isOpen && (
                <div className="border-t border-sidebar-border/60 overflow-auto max-h-[calc(100dvh-13rem)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-sidebar-border/40">
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground w-16 bg-sidebar-accent">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={allEnabled}
                            disabled={toggleable.length === 0}
                            aria-label={allEnabled ? "Disable all clients" : "Enable all clients"}
                            onClick={() => setAllEnabled(!allEnabled)}
                            className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${allEnabled ? "bg-brand-solid" : "bg-sidebar-border"}`}
                          >
                            <span className={`block size-3 rounded-full bg-white transition-transform ${allEnabled ? "translate-x-[11px]" : "translate-x-[1px]"}`} />
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-48">Client</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent min-w-[220px]">Recipients</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-36">PM</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-36">AM</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent min-w-[280px]">Status</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-28">Actions</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-44">Client send</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-40">Creation Date</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-28">Report Preview</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-28">Email Preview</th>
                        <th className="sticky top-0 z-20 text-left px-4 py-2 font-medium text-muted-foreground bg-sidebar-accent w-36">Drive</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleClients.map(client => {
                        const key = makeKey(client.clientIdCode, month.value);
                        const entry = reports.get(key);
                        const isLoading = loading.has(key);
                        const isReviewing = reviewing.has(key);
                        const err = errors.get(key);
                        const hasAccount = Boolean(client.accountId);
                        const enabled = hasAccount && !disabledCodes.has(client.code);
                        const perms = reviewPermissions({
                          userName: viewer?.name,
                          userEmail: viewer?.email,
                          projectManager: client.projectManager,
                          accountManager: client.accountManager,
                          canOverride: viewer?.canOverride ?? false,
                        });
                        const waiting = Boolean(entry?.status && isWaitingForReviewer(entry.status, perms));
                        const sendable = Boolean(entry?.status && canSend(entry.status, perms));
                        const createdAt = entry?.createdAt
                          ? new Date(entry.createdAt).toLocaleDateString("en-US", {
                              month: "short", day: "numeric", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })
                          : null;

                        return (
                          <tr key={client.code} className={`border-b border-sidebar-border/20 last:border-b-0 hover:bg-sidebar-accent/20${!enabled ? " opacity-50" : ""}`}>
                            <td className="px-4 py-2.5">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                disabled={!hasAccount}
                                aria-label={enabled ? `Disable ${client.name}` : `Enable ${client.name}`}
                                title={hasAccount ? undefined : "No Intentwise account on this client"}
                                onClick={() => setClientEnabled(client.code, !enabled)}
                                className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? "bg-brand-solid" : "bg-sidebar-border"}`}
                              >
                                <span className={`block size-3 rounded-full bg-white transition-transform ${enabled ? "translate-x-[11px]" : "translate-x-[1px]"}`} />
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-sidebar-foreground font-medium">{client.name}</td>
                            <td className="px-4 py-2.5">
                              <RecipientsEditor
                                book={client.recipients}
                                custom={customFor(client.clientIdCode, month.value)}
                                draft={customDraft[customRecipientKey(client.clientIdCode, month.value)] ?? ""}
                                onDraftChange={(value) => {
                                  setCustomDraft((prev) => ({
                                    ...prev,
                                    [customRecipientKey(client.clientIdCode, month.value)]: value,
                                  }));
                                }}
                                onAdd={() => addCustomRecipient(client, month.value)}
                                onRemove={(email) => removeCustomRecipient(client.clientIdCode, month.value, email)}
                                isEnabled={(email) => isRecipientEnabled(client.clientIdCode, email)}
                                onToggle={(email, next) => setRecipientEnabled(client.clientIdCode, email, next)}
                              />
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {client.projectManager ?? <span className="text-sidebar-border">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {client.accountManager ?? <span className="text-sidebar-border">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {entry?.status ? (
                                <div className="space-y-1">
                                  <ReviewPipeline status={entry.status} />
                                  {(entry.status === "blocked" || entry.status === "failed") && (
                                    <div className="text-[10px] text-muted-foreground">{reviewStatusLabel(entry.status)}</div>
                                  )}
                                  {entry.reviewNote && (
                                    <div className="text-[10px] text-brand-red max-w-[200px] truncate" title={entry.reviewNote}>
                                      {entry.reviewNote}
                                    </div>
                                  )}
                                </div>
                              ) : <span className="text-sidebar-border">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {isLoading ? (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Loader2 className="size-3 animate-spin" />Generating…
                                </span>
                              ) : isReviewing ? (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Loader2 className="size-3 animate-spin" />Saving…
                                </span>
                              ) : (
                                <div className="flex flex-col items-start gap-1">
                                  <div className="flex items-center gap-2">
                                    {waiting && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => { void review(client, month.value, "approve"); }}
                                          className="text-brand hover:underline font-medium"
                                        >
                                          {entry?.status === "jake_review" ? "Approve & send" : "Approve"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSendBackKey(key);
                                            setSendBackNote(entry?.reviewNote ?? "");
                                          }}
                                          className="text-muted-foreground hover:text-brand hover:underline"
                                        >
                                          Send back
                                        </button>
                                      </>
                                    )}
                                    {sendable && (
                                      <button
                                        type="button"
                                        onClick={() => { void openLetter(client, month.value); }}
                                        className="text-brand hover:underline font-medium"
                                      >
                                        Send
                                      </button>
                                    )}
                                    {canRunGenerate && (
                                      <button type="button" onClick={() => generate(client.code, month.value, client.clientIdCode)}
                                        disabled={!enabled || isBulk}
                                        title={!hasAccount ? "No Intentwise account on this client" : !enabled ? "Enable this client to generate" : isBulk ? "Wait for the current batch to finish" : undefined}
                                        className="text-muted-foreground hover:text-brand hover:underline disabled:opacity-40 disabled:hover:no-underline disabled:hover:text-muted-foreground">
                                        {entry ? "Regenerate" : "Generate"}
                                      </button>
                                    )}
                                  </div>
                                  {sendBackKey === key && (
                                    <div className="flex items-center gap-1">
                                      <input
                                        value={sendBackNote}
                                        onChange={e => setSendBackNote(e.target.value)}
                                        placeholder="Why send back?"
                                        className="h-6 w-40 rounded border border-sidebar-border bg-background px-1.5 text-[11px]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => { void review(client, month.value, "send_back", sendBackNote); }}
                                        className="text-brand hover:underline font-medium"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { setSendBackKey(null); setSendBackNote(""); }}
                                        className="text-muted-foreground hover:underline"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                              {err && <div className="text-brand-red mt-1 max-w-[220px] whitespace-normal break-words" title={err}>{err}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {entry?.sendDelivery || entry?.sentAt || entry?.status === "failed" ? (
                                <div className="space-y-0.5">
                                  <div className="tabular-nums">
                                    {formatSendStamp(entry.sendDelivery?.at ?? entry.sentAt)}
                                  </div>
                                  <div className={sendStatusClass(entry.sendDelivery?.status ?? (entry.status === "failed" ? "failed" : "sent"))}>
                                    {formatSendStatus(entry.sendDelivery?.status ?? (entry.status === "failed" ? "failed" : "sent"))}
                                  </div>
                                  {(entry.sendDelivery?.to ?? entry.sentTo ?? []).length > 0 && (
                                    <div className="text-[10px] truncate max-w-[180px]" title={(entry.sendDelivery?.to ?? entry.sentTo ?? []).join(", ")}>
                                      {(entry.sendDelivery?.to ?? entry.sentTo ?? []).join(", ")}
                                    </div>
                                  )}
                                  {entry.sendError && (
                                    <div className="text-[10px] text-brand-red truncate max-w-[180px]" title={entry.sendError}>{entry.sendError}</div>
                                  )}
                                </div>
                              ) : <span className="text-sidebar-border">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                              {createdAt ?? <span className="text-sidebar-border">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {entry ? (
                                <button type="button" onClick={() => { void openView(client, month.value); }}
                                  className="text-brand hover:underline font-medium">
                                  View
                                </button>
                              ) : (
                                <span className="text-sidebar-border">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {entry ? (
                                <button type="button" onClick={() => { void openLetter(client, month.value); }}
                                  className="text-brand hover:underline font-medium">
                                  Email
                                </button>
                              ) : (
                                <span className="text-sidebar-border">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {entry?.driveUrl ? (
                                <div className="flex flex-col items-start leading-tight">
                                  <a href={entry.driveUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-brand hover:underline font-medium">
                                    Open PDF
                                  </a>
                                  <a
                                    href={`/api/reports/monthly/html?clientCode=${encodeURIComponent(client.code)}&period=${encodeURIComponent(month.value)}`}
                                    className="text-brand hover:underline font-medium"
                                  >
                                    Download HTML
                                  </a>
                                </div>
                              ) : (
                                <span className="text-sidebar-border">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {visibleClients.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-4 py-6 text-muted-foreground">
                            {queueFilter === "mine" ? "No reports waiting for you this month." : "No clients."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {letterKey && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="letter-preview-title"
          onClick={closeLetter}
        >
          <button
            type="button"
            onClick={closeLetter}
            aria-label="Close email preview"
            className="fixed top-3 right-3 z-[220] inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-solid px-3 text-sm font-bold text-white shadow-lg hover:bg-brand-solid-hover"
          >
            <X className="size-4" />
            Close
          </button>
          <div
            className="fixed inset-3 bottom-16 right-3 left-3 mx-auto flex max-w-[min(1100px,96vw)] flex-col overflow-hidden rounded-lg border border-sidebar-border bg-card shadow-lg sm:right-16"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shrink-0 border-b border-sidebar-border px-4 py-3 pr-24">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email preview</p>
              <h2 id="letter-preview-title" className="text-sm font-bold text-sidebar-foreground">
                {letterPreview?.subject ?? `${letterClient?.name ?? "Client"} monthly report`}
              </h2>
            </div>
            <div className="max-h-[28vh] shrink-0 space-y-2 overflow-y-auto border-b border-sidebar-border px-4 py-3 text-xs text-muted-foreground">
              <div>
                <span className="font-bold uppercase tracking-wider text-[10px]">To</span>
                {letterPreview && letterClient && letterPeriod ? (
                  <div className="mt-1.5">
                    {letterPreview.recipients.length === 0 && customFor(letterClient.clientIdCode, letterPeriod).length === 0 && (
                      <p className="mb-1">No client email on AAC or portal users</p>
                    )}
                    <RecipientsEditor
                      book={letterPreview.recipients}
                      custom={customFor(letterClient.clientIdCode, letterPeriod)}
                      draft={customDraft[customRecipientKey(letterClient.clientIdCode, letterPeriod)] ?? ""}
                      onDraftChange={(value) => {
                        setCustomDraft((prev) => ({
                          ...prev,
                          [customRecipientKey(letterClient.clientIdCode, letterPeriod)]: value,
                        }));
                      }}
                      onAdd={() => addCustomRecipient(letterClient, letterPeriod)}
                      onRemove={(email) => removeCustomRecipient(letterClient.clientIdCode, letterPeriod, email)}
                      isEnabled={(email) => isRecipientEnabled(letterClient.clientIdCode, email)}
                      onToggle={(email, next) => setRecipientEnabled(letterClient.clientIdCode, email, next)}
                    />
                  </div>
                ) : (
                  <span> …</span>
                )}
              </div>
              <p>
                <span className="font-bold uppercase tracking-wider text-[10px]">Reply-To</span>
                {" "}
                {letterPreview?.replyTo ?? "—"}
              </p>
              <p>
                <span className="font-bold uppercase tracking-wider text-[10px]">Cc</span>
                {" "}
                {(letterPreview?.cc ?? []).join(", ") || "—"}
              </p>
              <p>The email is a short letter with headline numbers. Click for more details opens the full report in the client portal.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-[#F4F4F2] p-3">
              {letterLoading ? (
                <div className="flex items-center gap-2 px-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading report HTML…
                </div>
              ) : letterPreview?.html ? (
                <iframe
                  title="Report HTML email preview"
                  sandbox=""
                  srcDoc={letterPreview.html}
                  className="h-full min-h-0 w-full rounded border border-sidebar-border bg-white"
                />
              ) : (
                <p className="px-2 py-8 text-sm text-muted-foreground">No report HTML.</p>
              )}
            </div>
            {letterError && (
              <p className="shrink-0 px-4 py-2 text-xs text-red-400">{letterError}</p>
            )}
          </div>
          <div
            className="fixed bottom-3 right-3 z-[220] flex items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeLetter}
              className="rounded-md border border-sidebar-border bg-card px-3 py-2 text-xs font-medium text-sidebar-foreground shadow-lg hover:bg-sidebar-accent"
            >
              Close
            </button>
            {letterClient && letterPeriod && canSend(
              reports.get(letterKey)?.status ?? "",
              reviewPermissions({
                userName: viewer?.name,
                userEmail: viewer?.email,
                projectManager: letterClient.projectManager,
                accountManager: letterClient.accountManager,
                canOverride: viewer?.canOverride ?? false,
              }),
            ) && (
              <button
                type="button"
                onClick={() => { void sendLetter(); }}
                disabled={letterSending || letterLoading || !letterPreview || enabledRecipientsFor(letterClient, allRecipientsFor(letterClient, letterPeriod, letterPreview.recipients)).length === 0}
                className="rounded-md bg-brand-solid px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-brand-solid-hover disabled:opacity-40"
              >
                {letterSending
                  ? "Sending…"
                  : `Send to ${enabledRecipientsFor(letterClient, allRecipientsFor(letterClient, letterPeriod, letterPreview?.recipients ?? [])).length}`}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
