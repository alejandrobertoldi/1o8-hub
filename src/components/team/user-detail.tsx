"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { canWriteField, type Access } from "@/lib/team/access";
import { CountryFlag } from "@/components/country-flag";
import {
  COUNTRY_FULL_NAMES,
  countrySelectOptions,
  internalTeamLabel,
  isCountryCode,
} from "@/lib/constants";
import { timeZoneSelectOptions } from "@/lib/timezones";
import { roleLabel } from "@/lib/roles";
import { EditableField } from "./editable-field";
import { JobTitlesField } from "./job-titles-field";
import { ApprovedPtoBlock } from "./approved-pto-block";
import { HolidayBlock, yearOptions } from "./holiday-block";
import { TimeOffSettings } from "./time-off-settings";
import { FinancialBlock } from "./financial-block";
import { PaymentBlock } from "./payment-block";
import { DirectoryBlock } from "./directory-block";
import { displayJobTitles, TEAM_DEPARTMENT_OPTIONS } from "@/lib/team/departments";

/** Same six-country list + flag labels as Holiday calendar. */
const RESIDENCE_COUNTRY_OPTIONS = countrySelectOptions();

export type TeamUserPayload = {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    clientIdCode: string | null;
    jobTitle: string | null;
    jobTitles: string[];
    departments: string[];
    leadsDepartments: string[];
    startDate: string | null;
    employmentStatus: "active" | "inactive" | "alumni";
    phone: string | null;
    slackHandle: string | null;
    countryCode: string | null;
    residenceTimezone: string | null;
    timeOffVia: string;
    timeOffApproverId: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  };
  access: Access;
  /** 1o8 directory facts (tier 0); null when the person has no directory row. */
  directory?: import("@/lib/db/schema").TeamDirectoryProfile | null;
  /** Admins may edit directory fields regardless of the owner-only card gate. */
  canEditDirectory?: boolean;
  /** True when the viewer gets only the tier-0 card (not owner, not self). */
  restricted?: boolean;
  profile?: {
    personalEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
    addressCountry: string | null;
    dateOfBirth: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelation: string | null;
  } | null;
  pay?: {
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    contractType: "hourly" | "salaried" | "contractor";
    // numeric(12,2) arrives as a STRING from the driver and stays one all the
    // way to the DOM. Never parseFloat it back into a value you then send.
    rateAmount: string;
    rateCurrency: string;
    ratePeriod: "hour" | "month" | "year";
    note: string | null;
  }[];
  payment?: {
    paymentMethod: string | null;
    paymentCadence: string | null;
    invoicesRequired: boolean;
    payeeName: string | null;
    bankName: string | null;
    bankCountry: string | null;
    accountIdentifierLast4: string | null;
    taxIdLast4: string | null;
    wiseQrUrl: string | null;
    keyVersion: number;
    hasAccountIdentifier: boolean;
    hasTaxId: boolean;
  } | null;
};

export const CARD =
  "rounded-xl border border-stone-200 bg-card hover:border-stone-300 hover:shadow-md " +
  "transition-all card-glow animate-card-enter dark:border-zinc-800 dark:hover:border-zinc-700";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-brand">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The exact three values PATCH /api/team/[userId] accepts for
 * employmentStatus (route.ts EMPLOYMENT_STATUSES). The column is
 * `.notNull().default("active")`, and the route's enum branch runs BEFORE its
 * `value === null` early-return, so this field is edited through a <select>
 * and is never clearable.
 */
const EMPLOYMENT_STATUSES = ["active", "inactive", "alumni"] as const;

const STATUS_BADGE: Record<string, string> = {
  active:
    "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  inactive:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  alumni:
    "bg-stone-200 text-stone-500 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-800",
};

/**
 * Thrown by the query fn below so the render branch can tell "you're not
 * allowed to see this" (403, from the owner-only detail gate) apart from
 * every other failure (network error, 404, 500, …), which stay generic.
 */
class TeamDetailFetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function UserDetail({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [timeOffYear, setTimeOffYear] = useState(
    () => new Date().getUTCFullYear()
  );

  const { data, isLoading, isError, error } = useQuery<TeamUserPayload>({
    queryKey: ["team-user", userId],
    queryFn: async () => {
      const res = await fetch(`/api/team/${userId}`);
      if (!res.ok) {
        if (res.status === 403) {
          throw new TeamDetailFetchError(403, "Forbidden");
        }
        throw new TeamDetailFetchError(res.status, "Failed to load this person");
      }
      return res.json();
    },
    // A 403 is an authorization answer, not a transient failure — retrying
    // it just re-asks the same question and gets the same answer.
    retry: (failureCount, err) =>
      err instanceof TeamDetailFetchError && err.status === 403
        ? false
        : failureCount < 3,
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, string | string[] | boolean | null>) => {
      const res = await fetch(`/api/team/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // The route distinguishes 400 (unknown/invalid) from 403 (forbidden)
        // and puts the reason in `error`. Surface it rather than a generic
        // "save failed", which hides an authorization answer.
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(error ?? "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-user", userId] });
      qc.invalidateQueries({ queryKey: ["team-directory"] });
      toast.success("Saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (isError || !data) {
    const isForbidden = error instanceof TeamDetailFetchError && error.status === 403;
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {isForbidden
          ? "You don't have permission to view this team member."
          : "This person could not be loaded."}
      </p>
    );
  }

  const { user, access, profile } = data;
  const can = (field: string) => canWriteField(field, access);
  const save = (field: string) => (next: string | null) => patch.mutate({ [field]: next });

  const initials = (user.name ?? user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  // Prefer the stored Google photo; when viewing yourself and the column is
  // still empty, fall back to the live session picture from this sign-in.
  const avatarSrc =
    user.image ??
    (session?.user?.id === user.id ? session.user.image ?? null : null);

  return (
    <div className="grid gap-2.5 lg:grid-cols-2">
      {/* 1. Identity */}
      <section className={`${CARD} p-5 lg:col-span-2`}>
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={avatarSrc ?? undefined} alt={user.name ?? user.email} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{user.name ?? user.email}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] font-bold">
                {roleLabel(user.role)}
              </Badge>
              {internalTeamLabel(user.clientIdCode) && (
                <Badge variant="outline" className="text-[9px] font-bold">
                  {internalTeamLabel(user.clientIdCode)}
                </Badge>
              )}
              <span
                className={`rounded-md border px-2 py-0.5 text-[9px] font-bold ${
                  STATUS_BADGE[user.employmentStatus]
                }`}
              >
                {user.employmentStatus}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Contact */}
      <Section title="Contact">
        <EditableField label="Phone" value={user.phone} canWrite={can("phone")} onSave={save("phone")} />
        {/* users.residence_timezone — lives on the user row (admin-writable),
            not user_profiles, so it stays outside the profile gate below. */}
        <EditableField
          label="Time zone"
          value={user.residenceTimezone}
          options={timeZoneSelectOptions(user.residenceTimezone)}
          allowClear
          canWrite={can("residenceTimezone")}
          onSave={save("residenceTimezone")}
          placeholder="UTC (default)"
        />
        {/* The route encodes TWO different answers in two different values
            (route.ts: `payload.profile = profile ?? null`, set only under
            allowsTier("self", access)):

              key ABSENT  → `undefined` → the viewer's tier does not permit
                            this block, so it is OMITTED entirely, never
                            greyed out (spec §5);
              key present but NULL → permitted, but `user_profiles` has no row
                            for this person yet.

            Gate on PERMISSION ALONE. Migration 0090 creates user_profiles
            empty — there is no backfill — and the only writer of a row is the
            PATCH these very fields fire, so a `profile !== null` guard would
            hide the block from everyone, forever, including from a person
            looking at their own page. Read through optionally instead: the
            empty, editable fields are what create the row on first save. */}
        {profile !== undefined && (
          <>
            <EditableField
              label="Personal email"
              type="email"
              value={profile?.personalEmail ?? null}
              canWrite={can("personalEmail")}
              onSave={save("personalEmail")}
            />
            <EditableField
              label="Address"
              value={profile?.addressLine1 ?? null}
              canWrite={can("addressLine1")}
              onSave={save("addressLine1")}
            />
            <EditableField
              label="Address line 2"
              value={profile?.addressLine2 ?? null}
              canWrite={can("addressLine2")}
              onSave={save("addressLine2")}
            />
            <EditableField
              label="City"
              value={profile?.city ?? null}
              canWrite={can("city")}
              onSave={save("city")}
            />
            <EditableField
              label="Postcode"
              value={profile?.postcode ?? null}
              canWrite={can("postcode")}
              onSave={save("postcode")}
            />
            {/* NOT the holiday calendar. See the Time off & holidays card.
                Stores alpha-2; displays flag + full English name. */}
            <EditableField
              label="Country of residence"
              value={profile?.addressCountry ?? null}
              options={RESIDENCE_COUNTRY_OPTIONS}
              allowClear
              canWrite={can("addressCountry")}
              onSave={save("addressCountry")}
              renderDisplay={(code) =>
                code && isCountryCode(code) ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CountryFlag code={code} />
                    <span>{COUNTRY_FULL_NAMES[code]}</span>
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <EditableField
              label="Date of birth"
              type="date"
              value={profile?.dateOfBirth ?? null}
              canWrite={can("dateOfBirth")}
              onSave={save("dateOfBirth")}
            />
            <EditableField
              label="Emergency contact"
              value={profile?.emergencyContactName ?? null}
              canWrite={can("emergencyContactName")}
              onSave={save("emergencyContactName")}
            />
            <EditableField
              label="Emergency phone"
              value={profile?.emergencyContactPhone ?? null}
              canWrite={can("emergencyContactPhone")}
              onSave={save("emergencyContactPhone")}
            />
            <EditableField
              label="Emergency relation"
              value={profile?.emergencyContactRelation ?? null}
              canWrite={can("emergencyContactRelation")}
              onSave={save("emergencyContactRelation")}
            />
          </>
        )}
      </Section>

      {/* 2b. 1o8 directory (team_directory_profiles) */}
      <Section title="Directory">
        <DirectoryBlock userId={userId} directory={data.directory ?? null} canEdit={!!data.canEditDirectory} />
      </Section>

      {/* 3. Employment */}
      <Section title="Employment">
        <JobTitlesField
          titles={displayJobTitles(user.jobTitle, user.jobTitles)}
          canWrite={can("jobTitles")}
          onSave={(next) => patch.mutate({ jobTitles: next })}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Departments
          </span>
          <div className="flex flex-wrap gap-2">
            {TEAM_DEPARTMENT_OPTIONS.map((opt) => {
              const checked = user.departments.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!can("departments")}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...user.departments, opt.value]
                        : user.departments.filter((d) => d !== opt.value);
                      patch.mutate({ departments: next });
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            Leads department(s)
          </span>
          <div className="flex flex-wrap gap-2">
            {TEAM_DEPARTMENT_OPTIONS.map((opt) => {
              const checked = user.leadsDepartments.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!can("leadsDepartments")}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...user.leadsDepartments, opt.value]
                        : user.leadsDepartments.filter((d) => d !== opt.value);
                      patch.mutate({ leadsDepartments: next });
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
        <EditableField
          label="Start date"
          type="date"
          value={user.startDate}
          canWrite={can("startDate")}
          onSave={save("startDate")}
        />
        <EditableField
          label="Status"
          value={user.employmentStatus}
          options={EMPLOYMENT_STATUSES}
          canWrite={can("employmentStatus")}
          onSave={save("employmentStatus")}
        />
      </Section>

      {/* Admins set this on anyone, even on the restricted card. */}
      {data.restricted && can("timeOffVia") && (
        <Section title="Time off">
          <TimeOffSettings
            userId={userId}
            timeOffVia={user.timeOffVia}
            timeOffApproverId={user.timeOffApproverId}
            canWrite
            onSave={(body) => patch.mutate(body)}
          />
        </Section>
      )}

      {!data.restricted && (
      <Section title="Time off & holidays">
        <TimeOffSettings
          userId={userId}
          timeOffVia={user.timeOffVia}
          timeOffApproverId={user.timeOffApproverId}
          canWrite={can("timeOffVia")}
          onSave={(body) => patch.mutate(body)}
        />
        <div className="mb-4 flex items-center gap-2">
          <label
            htmlFor="time-off-year"
            className="text-[10px] font-bold uppercase text-muted-foreground"
          >
            Year
          </label>
          <select
            id="time-off-year"
            value={timeOffYear}
            onChange={(e) => setTimeOffYear(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-0.5 text-sm focus:border-brand focus:outline-none"
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <ApprovedPtoBlock
          userId={userId}
          year={timeOffYear}
          residenceTimezone={user.residenceTimezone}
          showPrivate={access.isSelf || access.isAdmin}
        />
        <div className="mb-4 border-t border-border/40" />
        <HolidayBlock
          countryCode={user.countryCode}
          residenceTimezone={user.residenceTimezone}
          year={timeOffYear}
          onYearChange={setTimeOffYear}
          hideYearSelect
          canWriteCalendar={can("countryCode")}
          onSaveCalendar={save("countryCode")}
        />
      </Section>
      )}

      {/* Financial: API includes `pay` for owner (self) or super-admin.
          Edits stay super-admin only — canEdit is never inferred from
          "the payload arrived". Payment stays super-admin only (ruling F3). */}
      {data.pay !== undefined && (
        <Section title="Financial">
          <FinancialBlock
            userId={userId}
            pay={data.pay}
            canEdit={access.isSuperAdmin}
          />
        </Section>
      )}
      {data.payment !== undefined && (
        <Section title="Payment">
          <PaymentBlock
            userId={userId}
            payment={data.payment}
            canEdit={access.isSuperAdmin}
          />
        </Section>
      )}
    </div>
  );
}
