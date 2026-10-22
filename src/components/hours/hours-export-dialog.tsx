"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hoursExportFilename } from "@/lib/hours/export";

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: isoDate(monday), to: isoDate(sunday) };
}

function lastWeekRange(): { from: string; to: string } {
  const { from } = currentWeekRange();
  const [y, m, d] = from.split("-").map(Number);
  const thisMonday = new Date(y, m - 1, d);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return { from: isoDate(lastMonday), to: isoDate(lastSunday) };
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

function lastMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: isoDate(first), to: isoDate(last) };
}

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: "This week", range: currentWeekRange },
  { label: "Last week", range: lastWeekRange },
  { label: "This month", range: currentMonthRange },
  { label: "Last month", range: lastMonthRange },
];

export function HoursExportDialog({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);

  const invalidRange = Boolean(from && to && from > to);

  function handleOpenChange(next: boolean) {
    if (next) {
      setFrom(defaultFrom);
      setTo(defaultTo);
    }
    setOpen(next);
  }

  async function download() {
    if (!from || !to || invalidRange || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/hours/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Download failed" }));
        throw new Error(body.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = hoursExportFilename(from, to);
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Hours report downloaded");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => handleOpenChange(true)}
      >
        <Download className="size-3.5" />
        Download
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download hours report</DialogTitle>
            <DialogDescription>
              Choose a date range and download a spreadsheet of your logged hours.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => {
              const r = p.range();
              const active = from === r.from && to === r.to;
              return (
                <Button
                  key={p.label}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setFrom(r.from);
                    setTo(r.to);
                  }}
                >
                  {p.label}
                </Button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                From
              </label>
              <DatePicker
                value={from}
                onChange={(v) => v && setFrom(v)}
                className="h-8 w-full"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                To
              </label>
              <DatePicker
                value={to}
                onChange={(v) => v && setTo(v)}
                className="h-8 w-full"
              />
            </div>
          </div>

          {invalidRange && (
            <p className="text-xs text-destructive">From must be on or before To.</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={() => void download()}
              disabled={busy || invalidRange || !from || !to}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              Download spreadsheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
