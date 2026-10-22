import { MONTHLY_REPORT_FINAL_REVIEWER_EMAIL } from "@/lib/constants";
import { namesMatch } from "./review";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asRawRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

const AGENCY_EMAIL_HOSTS = new Set(["marketfoundry.agency", "1o8.agency"]);

/** Agency inboxes belong on Cc/Reply-To, never as the client greeting / To list. */
export function isAgencyStaffEmail(email: string): boolean {
  const host = email.trim().toLowerCase().split("@")[1] ?? "";
  return AGENCY_EMAIL_HOSTS.has(host);
}

export function firstNameFromDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function joinGreetingNames(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function mergeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!isEmail(email) || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/** AAC ClientContactEmail1–5. Skips AmazonContactEmail (Seller Central, not the brand). */
export function emailsFromAacRaw(raw: unknown): string[] {
  const obj = asRawRecord(raw);
  const found: string[] = [];
  for (let i = 1; i <= 5; i++) {
    found.push(String(obj[`ClientContactEmail${i}`] ?? ""));
  }
  return mergeEmails(found);
}

export function greetingNameFromAacRaw(raw: unknown): string | null {
  const obj = asRawRecord(raw);
  const name = String(obj.ClientContactName1 ?? "").trim();
  return name || null;
}

/** Lowercase email → display name from AAC contacts, then hub users (user name wins). */
export function namesByEmailFromSources(
  people: Array<{ name: string | null; email: string }>,
  aacRaw: unknown,
): Record<string, string> {
  const out: Record<string, string> = {};
  const obj = asRawRecord(aacRaw);
  for (let i = 1; i <= 5; i++) {
    const email = String(obj[`ClientContactEmail${i}`] ?? "").trim().toLowerCase();
    const name = String(obj[`ClientContactName${i}`] ?? "").trim();
    if (isEmail(email) && name) out[email] = name;
  }
  for (const person of people) {
    const email = person.email.trim().toLowerCase();
    const name = (person.name ?? "").trim();
    if (isEmail(email) && name) out[email] = name;
  }
  return out;
}

/** Greet the people actually on the send list, never a contact who is not receiving. */
export function greetingNameForSend(
  to: string[],
  namesByEmail: Record<string, string>,
): string | null {
  if (to.length === 0) return null;
  const seen = new Set<string>();
  const firsts: string[] = [];
  for (const email of to) {
    const full = namesByEmail[email.trim().toLowerCase()] ?? "";
    const first = firstNameFromDisplayName(full);
    const key = first.toLowerCase();
    if (!first || seen.has(key)) continue;
    seen.add(key);
    firsts.push(first);
  }
  return joinGreetingNames(firsts);
}

export function userAssignedToClient(
  userClientIdCode: string | null | undefined,
  clientIdCode: string,
): boolean {
  if (!userClientIdCode) return false;
  return userClientIdCode.split(",").map((s) => s.trim()).includes(clientIdCode);
}

export function portalEmailsFromUsers(
  people: Array<{ email: string; role: string; clientIdCode: string | null }>,
  clientIdCode: string,
): string[] {
  return mergeEmails(
    people
      .filter((p) =>
        (p.role === "client" || p.role === "prospect")
        && userAssignedToClient(p.clientIdCode, clientIdCode),
      )
      .map((p) => p.email),
  );
}

export function emailForAccountManager(
  people: Array<{ name: string | null; email: string }>,
  accountManager: string | null,
): string | null {
  if (!accountManager) return null;
  const hit = people.find((p) => namesMatch(p.name, accountManager) && isEmail(p.email));
  return hit?.email ?? null;
}

export function recipientsForClient(
  raw: unknown,
  people: Array<{ email: string; role: string; clientIdCode: string | null }>,
  clientIdCode: string,
): string[] {
  return mergeEmails([...emailsFromAacRaw(raw), ...portalEmailsFromUsers(people, clientIdCode)])
    .filter((email) => !isAgencyStaffEmail(email));
}

export const MAX_CUSTOM_RECIPIENTS = 10;

export function parseCustomRecipients(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return mergeEmails(raw.filter((email): email is string => typeof email === "string"))
    .slice(0, MAX_CUSTOM_RECIPIENTS);
}

/** Intersect a send request with the AAC/portal book plus optional one-off extras. */
export function filterSendRecipients(
  allowed: string[],
  requested: unknown,
  extras?: unknown,
): string[] {
  const extraEmails = parseCustomRecipients(extras);
  const allow = new Set(
    [...allowed, ...extraEmails].map((email) => email.toLowerCase()),
  );
  if (!Array.isArray(requested)) return allowed;
  return mergeEmails(
    requested.filter((email): email is string =>
      typeof email === "string" && allow.has(email.trim().toLowerCase()),
    ),
  );
}

/** AM Reply-To plus AM + CEO on Cc, unless they are already in To. */
export function staffThreadCopies(opts: {
  to: string[];
  accountManagerEmail: string | null | undefined;
  ceoEmail?: string | null;
}): { replyTo: string | null; cc: string[] } {
  const am = (opts.accountManagerEmail ?? "").trim();
  const ceo = (opts.ceoEmail ?? MONTHLY_REPORT_FINAL_REVIEWER_EMAIL).trim();
  const toSet = new Set(opts.to.map((email) => email.trim().toLowerCase()).filter(Boolean));
  const cc: string[] = [];
  const addCc = (email: string) => {
    const key = email.toLowerCase();
    if (!isEmail(email) || toSet.has(key) || cc.some((row) => row.toLowerCase() === key)) return;
    cc.push(email);
  };
  addCc(am);
  addCc(ceo);
  return {
    replyTo: isEmail(am) ? am : null,
    cc,
  };
}
