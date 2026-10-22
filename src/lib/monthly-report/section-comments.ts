import type { Report, SectionComment, SectionCommentRole, SectionId } from "@/components/monthly-report/types";

export const MAX_SECTION_COMMENT_CHARS = 2000;

export const COMMENTABLE_SECTION_IDS: readonly SectionId[] = [
  "execSummary",
  "kpis",
  "campaigns",
  "mom",
  "highlights",
  "risks",
  "channels",
  "products",
  "financials",
  "team",
  "goals",
];

const COMMENTABLE = new Set<string>(COMMENTABLE_SECTION_IDS);
const ROLES = new Set<SectionCommentRole>(["pm", "am", "ceo", "admin"]);

export function isCommentableSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && COMMENTABLE.has(value);
}

function asComment(raw: unknown): SectionComment | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.trim() : "";
  if (!text) return null;
  const role = typeof row.role === "string" && ROLES.has(row.role as SectionCommentRole)
    ? row.role as SectionCommentRole
    : "admin";
  return {
    text: text.slice(0, MAX_SECTION_COMMENT_CHARS),
    authorName: typeof row.authorName === "string" ? row.authorName.trim() : "",
    role,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
}

export function commentsFromUnknown(raw: unknown): Partial<Record<SectionId, SectionComment>> {
  const source = raw && typeof raw === "object"
    ? (raw as { sectionComments?: unknown }).sectionComments
    : undefined;
  if (!source || typeof source !== "object") return {};
  const out: Partial<Record<SectionId, SectionComment>> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!isCommentableSectionId(key)) continue;
    const comment = asComment(value);
    if (comment) out[key] = comment;
  }
  return out;
}

export function preserveSectionComments(next: Report, previous: unknown): Report {
  const comments = commentsFromUnknown(previous);
  if (Object.keys(comments).length === 0) return next;
  return { ...next, sectionComments: comments };
}

export function applySectionComment(
  report: Report,
  opts: {
    sectionId: unknown;
    text: unknown;
    authorName: string | null | undefined;
    role: SectionCommentRole;
    updatedAt: string;
  },
): { ok: true; report: Report } | { ok: false; error: string } {
  if (!isCommentableSectionId(opts.sectionId)) {
    return { ok: false, error: "That section cannot take a client note" };
  }
  const text = typeof opts.text === "string" ? opts.text.trim().slice(0, MAX_SECTION_COMMENT_CHARS) : "";
  const current = { ...(report.sectionComments ?? {}) };
  if (!text) {
    delete current[opts.sectionId];
  } else {
    current[opts.sectionId] = {
      text,
      authorName: (opts.authorName ?? "").trim(),
      role: opts.role,
      updatedAt: opts.updatedAt,
    };
  }
  const sectionComments = Object.keys(current).length > 0 ? current : undefined;
  return { ok: true, report: { ...report, sectionComments } };
}
