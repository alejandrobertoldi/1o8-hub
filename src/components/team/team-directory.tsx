"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { CompanyScaleChart } from "./company-scale-chart";
import { TeamDirectoryTable } from "./team-directory-table";
import { TeamOrgChart } from "./team-org-chart";
import { useRouter, useSearchParams } from "next/navigation";
import { hasAdminPowers } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { OrgMember } from "@/lib/team/departments";

type TeamMember = OrgMember & {
  role: string;
  clientIdCode: string | null;
  employmentStatus: "active" | "inactive" | "alumni";
  phone: string | null;
};

export function TeamDirectory() {
  const { data: session } = useSession();
  // Only an Owner may drill into ANOTHER member's detail page (the detail
  // route itself enforces this — see /api/team/[userId] — but gating the
  // link here means a non-owner never sees a card that 403s on click).
  const isOwner = session?.user?.role === "owner";
  const viewerId = session?.user?.id ?? null;
  // Everyone sees the directory; only admins add, edit or remove people.
  const isAdmin = hasAdminPowers(session?.user?.role);
  // ?view=org keeps the Org chart tab linkable. Assignments and Readiness have their own pages
  // (/team/assignments, /team/readiness); old ?view= links are forwarded there.
  const searchParams = useSearchParams();
  const router = useRouter();
  const VIEWS = ["directory", "org"] as const;
  type View = (typeof VIEWS)[number];
  const initial = searchParams.get("view");
  useEffect(() => {
    if (initial === "assignments" || initial === "readiness") router.replace(`/team/${initial}`);
  }, [initial, router]);
  const [view, setViewState] = useState<View>(VIEWS.includes(initial as View) ? (initial as View) : "directory");
  const setView = (v: View) => {
    setViewState(v);
    router.replace(v === "directory" ? "/team" : `/team?view=${v}`, { scroll: false });
  };
  const { data, isLoading, isError } = useQuery<TeamMember[]>({
    queryKey: ["team-directory"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("Failed to load the team directory");
      return res.json();
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading the team…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        The team directory could not be loaded.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b" role="tablist" aria-label="Team views">
        {(
          [
            ["directory", "Directory"],
            ["org", "Org chart"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              "px-4 py-2 text-sm transition-colors",
              view === key ? "border-b-2 border-brand font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "directory" ? (
        <TeamDirectoryTable isAdmin={isAdmin} viewerId={viewerId} />
      ) : (
        <>
          <TeamOrgChart isAdmin={isAdmin} />
          <CompanyScaleChart members={data} />
        </>
      )}
    </div>
  );
}
