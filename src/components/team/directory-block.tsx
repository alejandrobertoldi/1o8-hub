"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TeamDirectoryProfile } from "@/lib/db/schema";
import { EditableField } from "./editable-field";

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

const EMPLOYMENT_TYPES = ["Full Time Employee", "Independent Contractor", "Owner", "CEO"];

/**
 * The 1o8 directory facts on a person's card (team_directory_profiles).
 * Everyone sees them; admins edit them inline through PATCH
 * /api/team/directory/[userId] (partial, one field per save).
 */
export function DirectoryBlock({
  userId,
  directory,
  canEdit,
}: {
  userId: string;
  directory: Pick<
    TeamDirectoryProfile,
    | "company"
    | "expertise"
    | "employmentType"
    | "location"
    | "timeZone"
    | "workDays"
    | "workStartLocal"
    | "workEndLocal"
    | "workStartChicago"
    | "workEndChicago"
  > | null;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: async (body: Record<string, string | string[] | null>) => {
      const res = await fetch(`/api/team/directory/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Save failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      qc.invalidateQueries({ queryKey: ["team-directory-table"] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const save = (field: string) => (next: string | null) => patch.mutate({ [field]: next });
  const d = directory;
  const days = d?.workDays ?? [];

  return (
    <>
      <EditableField label="Company" value={d?.company ?? null} canWrite={canEdit} onSave={save("company")} />
      <EditableField label="Expertise" value={d?.expertise ?? null} canWrite={canEdit} onSave={save("expertise")} />
      <EditableField
        label="Type"
        value={d?.employmentType ?? null}
        options={[...new Set([...EMPLOYMENT_TYPES, ...(d?.employmentType ? [d.employmentType] : [])])]}
        allowClear
        canWrite={canEdit}
        onSave={save("employmentType")}
      />
      <EditableField label="Location" value={d?.location ?? null} canWrite={canEdit} onSave={save("location")} placeholder="Puebla, MX" />
      <EditableField label="Time zone (label)" value={d?.timeZone ?? null} canWrite={canEdit} onSave={save("timeZone")} placeholder="CST (UTC-6)" />
      <EditableField label="Local start" value={d?.workStartLocal ?? null} canWrite={canEdit} onSave={save("workStartLocal")} placeholder="09:00 AM" />
      <EditableField label="Local end" value={d?.workEndLocal ?? null} canWrite={canEdit} onSave={save("workEndLocal")} placeholder="05:00 PM" />
      <EditableField label="Chicago start" value={d?.workStartChicago ?? null} canWrite={canEdit} onSave={save("workStartChicago")} placeholder="09:00 AM" />
      <EditableField label="Chicago end" value={d?.workEndChicago ?? null} canWrite={canEdit} onSave={save("workEndChicago")} placeholder="05:00 PM" />
      <div className="flex flex-col gap-1 py-1.5">
        <span className="text-[10px] font-bold uppercase text-muted-foreground">Work days</span>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(([k, label]) => {
            const on = days.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                disabled={!canEdit || patch.isPending}
                onClick={() => patch.mutate({ workDays: on ? days.filter((x) => x !== k) : [...days, k] })}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors disabled:cursor-default",
                  on ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted-foreground",
                  canEdit && !on && "hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
