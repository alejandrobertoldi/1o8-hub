"use client";
/* eslint-disable react-doctor/nextjs-no-use-search-params-without-suspense */
/* eslint-disable react-doctor/react-compiler-destructure-method */

import { useQuery } from "@tanstack/react-query";
import { useActivePortalClientCode, portalClientQuery } from "@/components/portal/portal-visible-clients";
import {
  CheckCircle2,
  XCircle,
  Upload,
  FileText,
  MessageSquare,
  Clock,
  Loader2,
} from "lucide-react";

interface ActivityEvent {
  id: number;
  section: string;
  action: string;
  status: string;
  message: string | null;
  resourceLabel: string | null;
  createdAt: string;
  userName: string | null;
}

function eventIcon(action: string, status: string) {
  if (status === "error") return <XCircle className="size-3.5 text-red-500" />;
  if (action.includes("upload")) return <Upload className="size-3.5 text-blue-500" />;
  if (action.includes("comment")) return <MessageSquare className="size-3.5 text-amber-500" />;
  if (action.includes("approved") || action.includes("live")) return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  if (action.includes("publish")) return <FileText className="size-3.5 text-purple-500" />;
  return <Clock className="size-3.5 text-muted-foreground" />;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US");
}

export function ActivityFeed({ clientIdCode: forcedClient }: { clientIdCode?: string } = {}) {
  const active = useActivePortalClientCode();
  // A stacked portal page passes the client explicitly; the hub /activity page
  // and any legacy caller keep resolving the active portal client.
  const clientIdCode = forcedClient ?? active.clientIdCode;
  const ready = forcedClient ? true : active.ready;

  const { data, isLoading, isError } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: ["portal-activity", clientIdCode],
    queryFn: async () => {
      const url = clientIdCode
        ? `/api/portal/activity${portalClientQuery(clientIdCode)}`
        : `/api/portal/activity`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    enabled: ready && !!clientIdCode,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground justify-center">
        <Loader2 className="size-3 animate-spin" />
        Loading activity…
      </div>
    );
  }

  if (isError) return null;

  const events = data?.events ?? [];

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        No recent activity for your products.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {events.slice(0, 20).map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-3 py-2.5 px-1 border-b border-border last:border-0"
        >
          <div className="mt-0.5 shrink-0">
            {eventIcon(event.action, event.status)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">
              {event.message ?? event.action}
            </p>
            {event.resourceLabel && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {event.resourceLabel}
              </p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
            {relativeTime(event.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
