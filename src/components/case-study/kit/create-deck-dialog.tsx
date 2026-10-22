"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeckFormat } from "@/lib/case-study/kit/display";

function lastTwelveFullMonths(): { start: string; end: string } {
  const now = new Date();
  // First day of the month 12 months before the current month.
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  // Last day of last month.
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(startDate), end: fmt(endDate) };
}

const FORMAT_LABEL: Record<DeckFormat, string> = { high_level: "High-Level", detailed: "Detailed" };

export function CreateDeckDialog(props: {
  clientIdCode: string; format: DeckFormat; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void;
}) {
  const { clientIdCode, format, open, onOpenChange, onCreated } = props;
  const defaults = lastTwelveFullMonths();
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Reset transient create-result state whenever the dialog opens, so a stale
  // noAccount/createdId from a previous create doesn't leave the "Continue to
  // deck" button (and disabled dates) showing on the next open.
  useEffect(() => {
    if (open) {
      setNoAccount(false);
      setCreatedId(null);
      setError(null);
      setStart(defaults.start);
      setEnd(defaults.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/case-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIdCode, format, dateRangeStart: start, dateRangeEnd: end }),
      });
      const json = await res.json().catch(() => null) as { id?: string; error?: string; noAccount?: boolean } | null;
      if (!res.ok || !json?.id) {
        setError(json?.error ?? "Failed to create case study");
        return;
      }
      if (json.noAccount) {
        // Keep the dialog open so the notice is actually seen — closing immediately
        // would unmount it in the same tick as the state update.
        setNoAccount(true);
        setCreatedId(json.id);
        return;
      }
      onCreated(json.id);
      onOpenChange(false);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!createdId) return;
    onCreated(createdId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create {FORMAT_LABEL[format]} case study</DialogTitle>
          <DialogDescription>Pulls Redshift numbers and Design images for the date range below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cs-date-start">Date from</Label>
              <Input id="cs-date-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={!!createdId} />
            </div>
            <div>
              <Label htmlFor="cs-date-end">Date to</Label>
              <Input id="cs-date-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!!createdId} />
            </div>
          </div>
          {noAccount && (
            <p className="text-sm text-amber-700">No Intentwise account linked — every number will need data</p>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          {createdId ? (
            <Button onClick={handleContinue}>Continue to deck</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={loading || !start || !end}>
                {loading ? "Creating…" : "Create"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
