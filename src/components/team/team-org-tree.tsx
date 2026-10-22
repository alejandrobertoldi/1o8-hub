"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TEAM_DEPARTMENT_LABELS,
  buildOrgTree,
  displayJobTitles,
  isTeamDepartment,
  type OrgMember,
  type TeamDepartment,
} from "@/lib/team/departments";

const CARD =
  "rounded-[18px] border border-brand bg-card hover:border-brand-hover hover:shadow-md " +
  "transition-all card-glow dark:border-brand dark:hover:border-brand-hover";

function initialsOf(member: OrgMember): string {
  return (member.name ?? member.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function MemberCardContent({
  member,
  featured,
}: {
  member: OrgMember;
  featured: boolean;
}) {
  const titles = displayJobTitles(member.jobTitle, member.jobTitles);
  const isLeader = member.leadsDepartments.filter(isTeamDepartment).length > 0;
  return (
    <div className="flex items-start gap-3">
      <Avatar className={featured ? "size-10" : "size-8"}>
        {member.image ? (
          <AvatarImage src={member.image} alt={member.name ?? member.email} />
        ) : null}
        <AvatarFallback className="text-xs">{initialsOf(member)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className={`truncate font-bold ${featured ? "text-sm" : "text-xs"}`}>
          {member.name ?? member.email}
        </p>
        {member.name ? (
          <p className="truncate text-[10px] text-muted-foreground">{member.email}</p>
        ) : null}
        {titles.map((title) => (
          <p key={title} className="truncate text-xs text-muted-foreground">
            {title}
          </p>
        ))}
        {isLeader ? (
          <div className="mt-1 flex flex-col items-start gap-1">
            {member.leadsDepartments
              .filter(isTeamDepartment)
              .map((d) => (
                <span
                  key={d}
                  className="inline-block rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[9px] font-bold uppercase text-brand"
                >
                  Leads {TEAM_DEPARTMENT_LABELS[d as TeamDepartment]}
                </span>
              ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MemberCard({
  member,
  featured = false,
  fill = false,
  isOwner,
  viewerId,
}: {
  member: OrgMember;
  featured?: boolean;
  fill?: boolean;
  isOwner: boolean;
  viewerId: string | null;
}) {
  const isLeader = member.leadsDepartments.filter(isTeamDepartment).length > 0;
  const width = featured
    ? "p-5 w-[16rem]"
    : fill
      ? "p-3 w-full"
      : "p-3 w-[16rem]";
  // Only an Owner may drill into ANOTHER member's detail page; everyone else
  // can only open their own — the org DIRECTORY stays visible to all, only
  // the detail drill-in is gated (the route itself enforces this too).
  const clickable = isOwner || member.id === viewerId;

  if (clickable) {
    return (
      <Link
        href={`/team/${member.id}`}
        className={`${CARD} block ${width} focus:border-brand focus:outline-none ${
          isLeader ? "ring-1 ring-brand/40" : ""
        }`}
      >
        <MemberCardContent member={member} featured={featured} />
      </Link>
    );
  }

  return (
    <div
      className={`${CARD} cursor-default ${width} ${
        isLeader ? "ring-1 ring-brand/40" : ""
      }`}
    >
      <MemberCardContent member={member} featured={featured} />
    </div>
  );
}

function Stem() {
  return <div className="h-4 w-0.5 bg-brand" aria-hidden />;
}

function SectionContainer({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-stone-200 bg-muted p-4 dark:border-zinc-800">
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-foreground">
        {label}
      </h2>
      {children}
    </div>
  );
}

function LevelBand({
  label,
  children,
  empty,
}: {
  label: string;
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Stem />
      <SectionContainer label={label}>
        {empty ? (
          <p className="text-xs text-muted-foreground">None assigned</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2.5">{children}</div>
        )}
      </SectionContainer>
    </div>
  );
}

export function TeamOrgTree({
  members,
  isOwner,
  viewerId,
}: {
  members: OrgMember[];
  isOwner: boolean;
  viewerId: string | null;
}) {
  const tree = buildOrgTree(members);

  return (
    <div className="flex flex-col items-center gap-1">
      <SectionContainer label="Leadership">
        {tree.president.length === 0 ? (
          <p className="text-xs text-muted-foreground">None assigned</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2.5">
            {tree.president.map((m) => (
              <MemberCard key={m.id} member={m} featured isOwner={isOwner} viewerId={viewerId} />
            ))}
          </div>
        )}
      </SectionContainer>

      <LevelBand label="Account managers" empty={tree.ams.length === 0}>
        {tree.ams.map((m) => (
          <MemberCard key={m.id} member={m} isOwner={isOwner} viewerId={viewerId} />
        ))}
      </LevelBand>

      <LevelBand label="Project managers" empty={tree.pms.length === 0}>
        {tree.pms.map((m) => (
          <MemberCard key={m.id} member={m} isOwner={isOwner} viewerId={viewerId} />
        ))}
      </LevelBand>

      <Stem />
      <SectionContainer label="Departments">
        <div className="w-full overflow-x-auto">
        <div className="flex w-max mx-auto gap-2.5 pb-1">
          {tree.departments.map((col) => (
            <section
              key={col.id}
              className="flex w-[16rem] shrink-0 flex-col gap-2.5 rounded-[18px] border border-stone-200 bg-card p-4 dark:border-zinc-800"
            >
              <div className="w-full rounded-[18px] border border-blue-500 bg-card p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                  <h3 className="truncate text-[10px] font-bold uppercase tracking-wider">
                    {col.label}
                  </h3>
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                    {col.candidates.length || col.members.length}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  Lead: {col.lead ? col.lead.name ?? col.lead.email : "—"}
                </p>
              </div>
              {col.members.length === 0 ? (
                <p className="text-xs text-muted-foreground">No members at this level</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {col.members.map((m) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      fill
                      isOwner={isOwner}
                      viewerId={viewerId}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      </SectionContainer>
    </div>
  );
}
