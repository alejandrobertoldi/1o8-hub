"use client";

import { useQuery } from "@tanstack/react-query";

type ApproverOption = { id: string; name: string | null; email: string };

/**
 * Where a person books time off, and who approves it when they book in the
 * hub. Gusto people request in Gusto (the hub mirrors it); everyone else
 * requests in the hub and their approver (an admin or above) decides.
 */
export function TimeOffSettings({
  userId,
  timeOffVia,
  timeOffApproverId,
  canWrite,
  onSave,
}: {
  userId: string;
  timeOffVia: string;
  timeOffApproverId: string | null;
  canWrite: boolean;
  onSave: (patch: Record<string, string | null>) => void;
}) {
  const viaGusto = timeOffVia === "gusto";
  const { data: approverOptions = [] } = useQuery<ApproverOption[]>({
    queryKey: ["time-off", "approvers"],
    queryFn: async () => {
      const res = await fetch("/api/time-off/approvers");
      return res.ok ? res.json() : [];
    },
    staleTime: 5 * 60_000,
  });
  const options = approverOptions.filter((o) => o.id !== userId);
  const current = options.find((o) => o.id === timeOffApproverId);

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border/40 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--brand)]"
          checked={viaGusto}
          disabled={!canWrite}
          onChange={(e) => onSave({ timeOffVia: e.target.checked ? "gusto" : "hub" })}
        />
        Requests time off in Gusto
      </label>
      {viaGusto ? (
        <p className="text-xs text-muted-foreground">Requested and approved in Gusto; the hub shows it once Gusto syncs.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="time-off-approver" className="text-[10px] font-bold uppercase text-muted-foreground">
            Approver
          </label>
          {canWrite ? (
            <select
              id="time-off-approver"
              value={timeOffApproverId ?? ""}
              onChange={(e) => onSave({ timeOffApproverId: e.target.value || null })}
              className="rounded-md border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
            >
              <option value="">Any admin</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name ?? o.email}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm">{current ? current.name ?? current.email : "Any admin"}</span>
          )}
          <span className="text-xs text-muted-foreground">Requests in the hub; owners and super admins can also decide.</span>
        </div>
      )}
    </div>
  );
}
