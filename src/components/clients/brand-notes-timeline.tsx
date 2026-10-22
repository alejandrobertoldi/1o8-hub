/* eslint-disable react-doctor/prefer-useReducer */
"use client";
/* eslint-disable react-doctor/rendering-hydration-mismatch-time */

import { useState } from "react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

interface Note {
  id: string;
  bodyMd: string;
  authorEmail: string;
  createdAt: string;
}
interface Props {
  clientIdCode: string;
  canEdit: boolean;
  notes: Note[];
  currentUserEmail: string;
  isAdmin: boolean;
  onChange: () => Promise<void>;
}

export default function BrandNotesTimeline({
  clientIdCode, canEdit, notes, currentUserEmail, isAdmin, onChange,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  async function add() {
    if (!draft.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_md: draft }),
      });
      if (!r.ok) throw new Error(`add failed: ${r.status}`);
      setDraft("");
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function saveEdit(noteId: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_md: editDraft }),
      });
      if (!r.ok) throw new Error(`edit failed: ${r.status}`);
      setEditingId(null);
      await onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function del(noteId: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines/notes/${noteId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`delete failed: ${r.status}`);
      await onChange();
      setDeleteTargetId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <section className="border rounded p-4 flex flex-col gap-3">
      <h2 className="font-medium">Other Guidelines</h2>
      {canEdit && (
        <div className="flex flex-col gap-2">
          <textarea
            className="border rounded p-2 text-sm h-24"
            placeholder="Add a dated note (markdown)…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="border px-3 py-1 rounded text-sm w-fit disabled:opacity-50" disabled={busy || !draft.trim()} onClick={add}>
            + Add note
          </button>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="text-sm text-muted-foreground">No notes yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="py-2 pr-3 w-32">Date</th>
                <th className="py-2 pr-3">Guideline</th>
                <th className="py-2 pr-3 w-56">User</th>
                <th className="py-2 pr-3 w-16">Edit</th>
                <th className="py-2 pr-3 w-16">Delete</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => {
                const isEditing = editingId === n.id;
                const canMutate = canEdit && (isAdmin || n.authorEmail === currentUserEmail);
                return (
                  <tr key={n.id} className="border-b last:border-b-0 align-top">
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(n.createdAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            className="border rounded p-2 text-sm h-24 w-full"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button
                              className="border px-2 py-1 rounded text-xs disabled:opacity-50"
                              disabled={busy}
                              onClick={() => saveEdit(n.id)}
                            >
                              Save
                            </button>
                            <button
                              className="border px-2 py-1 rounded text-xs"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{n.bodyMd}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground break-all">{n.authorEmail}</td>
                    <td className="py-2 pr-3">
                      {canMutate && !isEditing && (
                        <button
                          className="text-xs underline"
                          onClick={() => { setEditingId(n.id); setEditDraft(n.bodyMd); }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {canMutate && !isEditing && (
                        <button
                          className="text-xs underline text-red-600"
                          onClick={() => setDeleteTargetId(n.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}

      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(o) => { if (!o) setDeleteTargetId(null); }}
        onConfirm={() => { if (deleteTargetId) void del(deleteTargetId); }}
        title="Delete note?"
        description="This will permanently delete this brand note. This action cannot be undone."
        pending={busy}
        confirmLabel="Delete note"
      />
    </section>
  );
}
