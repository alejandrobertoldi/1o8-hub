"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const NO_CALENDAR_MESSAGE =
  "Your holiday calendar isn't set. Ask an admin to set it on your profile before booking time off.";

/** Where people on Gusto request time off. */
export const GUSTO_TIME_OFF_URL = process.env.NEXT_PUBLIC_GUSTO_TIME_OFF_URL || "https://app.gusto.com";

interface RequestTimeOffDialogProps {
  countryCode: string | null;
  todayKey: string;
  onSubmitted: () => void;
  /** "gusto": this person requests in Gusto, so the button links there. */
  via?: string;
}

export function RequestTimeOffDialog(props: RequestTimeOffDialogProps) {
  if (props.via === "gusto") {
    return (
      <Button size="sm" asChild className="bg-brand-solid text-white hover:bg-brand-solid-hover">
        <a href={GUSTO_TIME_OFF_URL} target="_blank" rel="noreferrer" title="You request time off in Gusto; it shows up here after the next sync">
          <ExternalLink className="size-4 mr-1" />
          Request in Gusto
        </a>
      </Button>
    );
  }
  return <HubRequestDialog {...props} />;
}

function HubRequestDialog({
  countryCode,
  todayKey,
  onSubmitted,
}: RequestTimeOffDialogProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(todayKey);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const disabled = !countryCode;

  function reset() {
    setStartDate(todayKey);
    setEndDate(todayKey);
    setReason("");
    setError(null);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, reason: reason.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && body.conflict) {
          setError(`${body.error} (${body.conflict.startDate} → ${body.conflict.endDate})`);
        } else {
          setError(body.error ?? "Failed to submit request");
        }
        return;
      }
      setOpen(false);
      reset();
      onSubmitted();
    } catch (e) {
      console.error("[time-off] submit failed", e);
      setError("Failed to submit request. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          disabled={disabled}
          title={disabled ? NO_CALENDAR_MESSAGE : undefined}
          className="bg-brand-solid text-white hover:bg-brand-solid-hover"
        >
          <Plus className="size-4 mr-1" />
          Request time off
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request time off</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                Start
              </label>
              <DatePicker value={startDate} onChange={setStartDate} className="h-9 w-full text-xs" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                End
              </label>
              <DatePicker value={endDate} onChange={setEndDate} className="h-9 w-full text-xs" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
              Reason
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you taking time off?"
              rows={3}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={submitting || !reason.trim() || endDate < startDate}
              onClick={handleSubmit}
              className="bg-brand-solid text-white hover:bg-brand-solid-hover"
            >
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
