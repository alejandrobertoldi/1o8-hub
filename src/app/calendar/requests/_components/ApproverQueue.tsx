"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DaysTakenRow, RequestRow } from "@/lib/time-off/queries";

interface ApproverQueueProps {
  pending: RequestRow[];
  breakdown: DaysTakenRow[];
  onDecide: (id: string, status: "approved" | "denied", decisionNote: string | null) => Promise<void>;
}

export function ApproverQueue({ pending, breakdown, onDecide }: ApproverQueueProps) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decide(id: string, status: "approved" | "denied") {
    setBusyId(id);
    try {
      await onDecide(id, status, notes[id]?.trim() || null);
    } catch (e) {
      console.error("[time-off] decision failed", e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
          Pending ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing waiting on you.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/40 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.userName ?? r.userEmail}</span>
                  <span className="text-muted-foreground">
                    {r.startDate} &rarr; {r.endDate} ({r.workingDays}d)
                  </span>
                </div>
                <p>{r.reason}</p>
                <Textarea
                  placeholder="Optional note…"
                  rows={2}
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === r.id}
                    className="text-red-500 hover:bg-red-500/10"
                    onClick={() => decide(r.id, "denied")}
                  >
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === r.id}
                    className="bg-brand-solid text-white hover:bg-brand-solid-hover"
                    onClick={() => decide(r.id, "approved")}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
          Days taken this year
        </h3>
        {breakdown.length === 0 ? (
          <p className="text-xs text-muted-foreground">No approved time off yet.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {breakdown.map((b) => (
                <tr key={b.userId} className="border-b border-border/20">
                  <td className="py-1.5">{b.userName ?? b.userId}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
