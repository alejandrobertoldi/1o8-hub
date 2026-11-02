"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Square, Timer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClock, secondsToHours } from "@/lib/time-logs/timer";

type TimerView = { running: boolean; seconds: number; entryDate: string } | null;
type Action = "start" | "pause" | "resume" | "stop" | "discard";

/**
 * Optional timer for people who record time as they go: start, pause, and
 * stop — stopping hands the rounded hours (and the day it was started) to the
 * Log time form, where the entry is finished and added as usual.
 */
export function TimerControl({ today, step, onStop }: { today: string; step: number; onStop: (hours: number, entryDate: string) => void }) {
  const qc = useQueryClient();
  const { data, dataUpdatedAt } = useQuery<{ timer: TimerView }>({
    queryKey: ["time-log-timer"],
    queryFn: async () => (await fetch("/api/time-logs/timer")).json(),
    refetchOnWindowFocus: true,
  });
  const timer = data?.timer ?? null;

  // Tick locally from the server's figure, so the browser's clock doesn't matter.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer?.running]);
  const seconds = timer ? timer.seconds + (timer.running ? Math.max(0, Math.floor((now - dataUpdatedAt) / 1000)) : 0) : 0;

  // The tab title shows the clock while it runs.
  useEffect(() => {
    if (!timer?.running) return;
    const before = document.title;
    document.title = `⏱ ${formatClock(seconds)} · ${before.replace(/^⏱ \S+ · /, "")}`;
    return () => {
      document.title = before.replace(/^⏱ \S+ · /, "");
    };
  }, [timer?.running, seconds]);

  const act = useMutation({
    mutationFn: async (action: Action) => {
      const res = await fetch("/api/time-logs/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entryDate: today }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Timer action failed");
      return { action, ...json } as { action: Action; timer: TimerView; seconds?: number; entryDate?: string };
    },
    onSuccess: (r) => {
      qc.setQueryData(["time-log-timer"], { timer: r.timer });
      setNow(Date.now());
      if (r.action === "stop" && r.seconds !== undefined && r.entryDate) {
        const hours = secondsToHours(r.seconds, step);
        onStop(hours, r.entryDate);
        toast.success(`Timer stopped at ${formatClock(r.seconds)} → ${hours} h. Pick the client and project, then Add.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!timer) {
    return (
      <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate("start")}>
        <Timer className="size-4" /> Start timer
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "rounded-md px-2 py-1 font-mono text-sm font-bold tabular-nums",
          timer.running ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground",
        )}
        title={timer.entryDate !== today ? `Started on ${timer.entryDate}` : undefined}
      >
        {formatClock(seconds)}
      </span>
      {timer.running ? (
        <Button variant="outline" size="icon-sm" aria-label="Pause timer" disabled={act.isPending} onClick={() => act.mutate("pause")}>
          <Pause className="size-4" />
        </Button>
      ) : (
        <Button variant="outline" size="icon-sm" aria-label="Resume timer" disabled={act.isPending} onClick={() => act.mutate("resume")}>
          <Play className="size-4" />
        </Button>
      )}
      <Button variant="brand" size="sm" disabled={act.isPending} onClick={() => act.mutate("stop")}>
        <Square className="size-3.5" /> Stop
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Discard timer"
        disabled={act.isPending}
        onClick={() => window.confirm("Discard this timer without logging it?") && act.mutate("discard")}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
