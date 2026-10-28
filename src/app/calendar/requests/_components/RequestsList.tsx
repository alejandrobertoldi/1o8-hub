"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canCancel, canRevoke } from "@/lib/time-off/guards";
import type { RequestRow } from "@/lib/time-off/queries";

const STATUS_STYLES: Record<RequestRow["status"], string> = {
  pending:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  approved:
    "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  denied:
    "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
  cancelled:
    "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800",
};

interface RequestsListProps {
  requests: RequestRow[];
  showRequester: boolean;
  ownDays?: number;
  /** When set with `today`, own pending/future-approved rows get Cancel + Edit. */
  currentUserId?: string;
  /** Caller residence-zone today (YYYY-MM-DD) from GET /api/time-off. */
  today?: string;
  onCancel?: (id: string) => Promise<void> | void;
  onEdit?: (
    id: string,
    next: { startDate: string; endDate: string; reason: string }
  ) => Promise<void> | void;
  onRevoke?: (id: string, note: string) => Promise<void> | void;
}

export function RequestsList({
  requests,
  showRequester,
  ownDays,
  currentUserId,
  today,
  onCancel,
  onEdit,
  onRevoke,
}: RequestsListProps) {
  const [editing, setEditing] = useState<RequestRow | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<RequestRow | null>(null);
  const [revokeNote, setRevokeNote] = useState("");
  const [revokeError, setRevokeError] = useState<string | null>(null);

  function openEdit(r: RequestRow) {
    setEditing(r);
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    setReason(r.reason);
    setEditError(null);
  }

  function openRevoke(r: RequestRow) {
    setRevoking(r);
    setRevokeNote("");
    setRevokeError(null);
  }

  async function handleCancel(id: string) {
    if (!onCancel || busyId) return;
    if (!window.confirm("Cancel this time-off request?")) return;
    setBusyId(id);
    try {
      await onCancel(id);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit() {
    if (!editing || !onEdit || busyId) return;
    setBusyId(editing.id);
    setEditError(null);
    try {
      await onEdit(editing.id, {
        startDate,
        endDate,
        reason: reason.trim(),
      });
      setEditing(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke() {
    const note = revokeNote.trim();
    if (!revoking || !onRevoke || busyId || !note) return;
    setBusyId(revoking.id);
    setRevokeError(null);
    try {
      await onRevoke(revoking.id, note);
      setRevoking(null);
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : "Failed to revoke request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {ownDays !== undefined && (
        <p className="text-xs text-muted-foreground">
          You&rsquo;ve taken <span className="font-bold text-foreground">{ownDays}</span> day
          {ownDays === 1 ? "" : "s"} this year.
        </p>
      )}
      {requests.length === 0 ? (
        <p className="text-xs text-muted-foreground">No requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => {
            // Gusto's requests are changed in Gusto; the hub only mirrors them.
            const fromGusto = r.source === "gusto";
            const canModify =
              !fromGusto &&
              Boolean(currentUserId && today && onCancel && onEdit) &&
              r.userId === currentUserId &&
              canCancel(r.status, r.startDate, today!);
            const showRevoke = !fromGusto && Boolean(onRevoke) && canRevoke(r.status);
            return (
              <div key={r.id} className="rounded-lg border border-border/40 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.startDate} &rarr; {r.endDate}
                  </span>
                  <span className="flex items-center gap-1">
                    {fromGusto && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Gusto
                      </Badge>
                    )}
                    <Badge className={STATUS_STYLES[r.status]} variant="outline">
                      {r.status}
                    </Badge>
                  </span>
                </div>
                {showRequester && (
                  <p className="text-muted-foreground mt-1">{r.userName ?? r.userEmail}</p>
                )}
                <p className="mt-1">{r.reason}</p>
                {r.decisionNote && (
                  <p className="text-muted-foreground mt-1 italic">Note: {r.decisionNote}</p>
                )}
                {canModify || showRevoke ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canModify && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={busyId === r.id}
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-destructive hover:text-destructive"
                          disabled={busyId === r.id}
                          onClick={() => handleCancel(r.id)}
                        >
                          Cancel request
                        </Button>
                      </>
                    )}
                    {showRevoke && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-destructive hover:text-destructive"
                        disabled={busyId === r.id}
                        onClick={() => openRevoke(r)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit time off</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {editing?.status === "approved" ? (
              <p className="text-xs text-muted-foreground">
                Saving changes will move this request back to pending so an
                approver can confirm the new dates.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Start
                </label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  className="h-9 w-full text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  End
                </label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  className="h-9 w-full text-xs"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Reason
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
            {editError ? <p className="text-xs text-destructive">{editError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(null)}
                disabled={busyId === editing?.id}
              >
                Close
              </Button>
              <Button
                size="sm"
                variant="brand"
                disabled={
                  busyId === editing?.id ||
                  !reason.trim() ||
                  !startDate ||
                  !endDate ||
                  endDate < startDate
                }
                onClick={handleSaveEdit}
              >
                {busyId === editing?.id ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(revoking)}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke approved time off</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              This cancels the approved request and notifies the requester.
              Explain why so they understand the change.
            </p>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Note (required)
              </label>
              <Textarea
                value={revokeNote}
                onChange={(e) => setRevokeNote(e.target.value)}
                rows={3}
              />
            </div>
            {revokeError ? (
              <p className="text-xs text-destructive">{revokeError}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevoking(null)}
                disabled={busyId === revoking?.id}
              >
                Close
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busyId === revoking?.id || !revokeNote.trim()}
                onClick={handleRevoke}
              >
                {busyId === revoking?.id ? "Revoking…" : "Revoke request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
