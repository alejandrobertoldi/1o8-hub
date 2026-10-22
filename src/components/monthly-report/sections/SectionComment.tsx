'use client';

import React from "react";
import type { SectionComment, SectionCommentRole, SectionId } from "../types";
import { MAX_SECTION_COMMENT_CHARS } from "@/lib/monthly-report/section-comments";

const ROLE_LABEL: Record<SectionCommentRole, string> = {
  pm: "PM",
  am: "AM",
  ceo: "CEO",
  admin: "Admin",
};

function paragraphs(text: string): string[] {
  return text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

export function SectionCommentBlock({
  sectionId,
  comment,
  editable = false,
  saving = false,
  onSave,
}: {
  sectionId: SectionId;
  comment?: SectionComment | null;
  editable?: boolean;
  saving?: boolean;
  onSave?: (sectionId: SectionId, text: string) => void;
}) {
  const [draft, setDraft] = React.useState(comment?.text ?? "");
  React.useEffect(() => {
    setDraft(comment?.text ?? "");
  }, [comment?.text]);

  const saved = comment?.text?.trim() ?? "";
  if (!editable && !saved) return null;

  const byline = comment?.authorName
    ? `${comment.authorName}${comment.role ? ` · ${ROLE_LABEL[comment.role]}` : ""}`
    : null;
  const dirty = draft.trim() !== saved;

  return (
    <div className="section-note-wrap">
      <div className="container">
        <div className="section-note">
          <div className="section-note-label">Note for the client</div>
          {editable ? (
            <>
              <textarea
                className="section-note-input"
                value={draft}
                maxLength={MAX_SECTION_COMMENT_CHARS}
                disabled={saving}
                rows={3}
                placeholder="Add context the client should read with these numbers."
                aria-label={`Client note for ${sectionId}`}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="section-note-actions">
                {byline && <span className="section-note-by">{byline}</span>}
                <button
                  type="button"
                  className="section-note-save"
                  disabled={saving || !dirty}
                  onClick={() => onSave?.(sectionId, draft)}
                >
                  {saving ? "Saving" : saved ? "Save note" : "Add note"}
                </button>
              </div>
            </>
          ) : (
            <>
              {paragraphs(saved).map((p, i) => (
                <p key={i} className="section-note-body">{p}</p>
              ))}
              {comment?.authorName && (
                <div className="section-note-by">{comment.authorName}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
