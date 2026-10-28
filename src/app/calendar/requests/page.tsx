"use client";
import { hasAdminPowers } from "@/lib/roles";

import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { canApproveTimeOff } from "@/lib/time-off/guards";
import type { DaysTakenRow, RequestRow } from "@/lib/time-off/queries";
import { RequestsList } from "./_components/RequestsList";
import { ApproverQueue } from "./_components/ApproverQueue";

interface TimeOffSelfResponse {
  requests: RequestRow[];
  countryCode: string | null;
  today: string;
  /** Pending requests the caller can decide. */
  decidable?: string[];
}
interface DaysTakenResponse {
  year: number;
  ownDays: number;
  breakdown?: DaysTakenRow[];
}

export default function TimeOffRequestsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const approver = canApproveTimeOff(role);
  const currentYear = new Date().getFullYear();
  const queryClient = useQueryClient();

  const { data: selfData, isLoading, isError } = useQuery<TimeOffSelfResponse>({
    queryKey: ["time-off", "self"],
    queryFn: async () => {
      const res = await fetch("/api/time-off");
      if (!res.ok) throw new Error("Failed to load requests");
      return res.json();
    },
  });

  const { data: daysTaken } = useQuery<DaysTakenResponse>({
    queryKey: ["time-off", "days-taken", currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/time-off/days-taken?year=${currentYear}`);
      if (!res.ok) throw new Error("Failed to load days taken");
      return res.json();
    },
  });

  async function handleDecide(
    id: string,
    status: "approved" | "denied",
    decisionNote: string | null
  ) {
    try {
      const res = await fetch(`/api/time-off/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, decisionNote }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to record decision");
        return;
      }
      toast.success(status === "approved" ? "Request approved" : "Request denied");
      queryClient.invalidateQueries({ queryKey: ["time-off"] });
    } catch (e) {
      console.error("[time-off] decision request failed", e);
      toast.error("Failed to record decision");
    }
  }

  async function handleCancel(id: string) {
    const res = await fetch(`/api/time-off/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Failed to cancel request");
      return;
    }
    toast.success("Request cancelled");
    queryClient.invalidateQueries({ queryKey: ["time-off"] });
  }

  async function handleRevoke(id: string, note: string) {
    const res = await fetch(`/api/time-off/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled", decisionNote: note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Failed to revoke request");
    toast.success("Time off revoked");
    queryClient.invalidateQueries({ queryKey: ["time-off"] });
  }

  async function handleEdit(
    id: string,
    next: { startDate: string; endDate: string; reason: string }
  ) {
    const res = await fetch(`/api/time-off/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        res.status === 409 && body.conflict
          ? `${body.error} (${body.conflict.startDate} → ${body.conflict.endDate})`
          : (body.error ?? "Failed to update request");
      throw new Error(msg);
    }
    toast.success(
      body.wasApproved
        ? "Updated — sent back for approval"
        : "Request updated"
    );
    queryClient.invalidateQueries({ queryKey: ["time-off"] });
  }

  if (isLoading) {
    return <div className="p-8 text-xs text-muted-foreground">Loading…</div>;
  }

  if (isError || !selfData) {
    return (
      <div className="p-8 text-xs text-muted-foreground">
        Couldn&rsquo;t load your requests. Refresh to try again.
      </div>
    );
  }

  const requests = selfData.requests;
  const decidable = new Set(selfData.decidable ?? []);
  const pending = requests.filter((r) => r.status === "pending" && decidable.has(r.id));
  const mine = requests.filter((r) => r.userId === session?.user?.id);
  const listActions = {
    currentUserId: session?.user?.id,
    today: selfData.today,
    onCancel: handleCancel,
    onEdit: handleEdit,
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none">
          <span className="font-bold text-sidebar-foreground">Time Off</span>
          <span className="font-normal text-brand">Requests</span>
        </h1>
      </PageMetaSlot>

      {approver ? (
        <div className="space-y-8">
          <ApproverQueue
            pending={pending}
            breakdown={daysTaken?.breakdown ?? []}
            onDecide={handleDecide}
          />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              My requests
            </h3>
            <RequestsList
              requests={mine}
              showRequester={false}
              ownDays={daysTaken?.ownDays}
              {...listActions}
            />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              All requests
            </h3>
            <RequestsList requests={requests} showRequester onRevoke={handleRevoke} />
          </div>
        </div>
      ) : hasAdminPowers(role) ? (
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              My requests
            </h3>
            <RequestsList
              requests={mine}
              showRequester={false}
              ownDays={daysTaken?.ownDays}
              {...listActions}
            />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand mb-2">
              All requests
            </h3>
            <RequestsList requests={requests} showRequester />
          </div>
        </div>
      ) : (
        <RequestsList
          requests={requests}
          showRequester={false}
          ownDays={daysTaken?.ownDays}
          {...listActions}
        />
      )}
    </div>
  );
}
