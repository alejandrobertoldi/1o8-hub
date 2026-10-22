/* eslint-disable react-doctor/no-derived-useState */
"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import BrandBookCard from "./brand-book-card";
import BrandSummaryCards from "./brand-summary-cards";
import BrandLogoUploader from "./brand-logo-uploader";
import BrandNotesTimeline from "./brand-notes-timeline";
import BrandVersionHistory from "./brand-version-history";
import BrandMdPreview from "./brand-md-preview";
import type { ContentGuidelines } from "@/lib/variation-guidelines";
import { isGuidelinesPresent } from "@/lib/variation-guidelines";
import { hasAdminPowers, type UserRole } from "@/lib/roles";

type Role = UserRole;

type VariationGuidelinesEntry = {
  id: string;
  name: string;
  code: string;
  status: string;
  contentGuidelines: ContentGuidelines | null;
  groups: Array<{ id: string; name: string; contentGuidelines: ContentGuidelines | null }>;
};

function GuidelinesChips({ gl }: { gl: ContentGuidelines }) {
  const chips = [
    gl.messagingAngle && { label: "Angle", value: gl.messagingAngle },
    gl.targetAudience && { label: "Audience", value: gl.targetAudience },
    gl.keyFeatures?.length && { label: "Features", value: gl.keyFeatures.join(", ") },
    gl.doList?.length && { label: "Do", value: gl.doList.join(", ") },
    gl.dontList?.length && { label: "Don't", value: gl.dontList.join(", ") },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-1.5 py-2">
      {chips.map((c) => (
        <div key={c.label} className="flex gap-2 text-xs">
          <span className="text-muted-foreground w-16 shrink-0">{c.label}</span>
          <span className="text-foreground">{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function VariationGuidelinesCard({ entries }: { entries: VariationGuidelinesEntry[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-stone-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-200 dark:border-zinc-800">
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand">
          Variation Guidelines
        </h2>
      </div>
      <div className="divide-y divide-stone-100 dark:divide-zinc-800">
        {entries.map((v) => (
          <div key={v.id}>
            <button
              onClick={() => toggle(v.id)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-stone-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              {openIds.has(v.id) ? (
                <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
              )}
              <Link
                href={`/variations/${v.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-bold text-brand hover:underline"
              >
                {v.name}
              </Link>
              <span className="text-[10px] text-muted-foreground">{v.code}</span>
              {isGuidelinesPresent(v.contentGuidelines) && (
                <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {v.contentGuidelines!.messagingAngle ?? v.contentGuidelines!.keyFeatures?.join(", ")}
                </span>
              )}
            </button>
            {openIds.has(v.id) && (
              <div className="px-5 pb-4 space-y-4">
                {isGuidelinesPresent(v.contentGuidelines) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      Variation Defaults
                    </p>
                    <GuidelinesChips gl={v.contentGuidelines!} />
                  </div>
                )}
                {v.groups.map((g) => (
                  <div key={g.id}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {g.name}{" "}
                      <span className="normal-case">
                        {isGuidelinesPresent(g.contentGuidelines)
                          ? "(group override)"
                          : isGuidelinesPresent(v.contentGuidelines)
                          ? "(from variation)"
                          : "(brand guidelines)"}
                      </span>
                    </p>
                    {isGuidelinesPresent(g.contentGuidelines) ? (
                      <GuidelinesChips gl={g.contentGuidelines!} />
                    ) : isGuidelinesPresent(v.contentGuidelines) ? (
                      <GuidelinesChips gl={v.contentGuidelines!} />
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Using brand voice guidelines
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface InitialState {
  bg: any | null;
  activeVersion: any | null;
  versions: any[];
  notes: any[];
  logoFiles: any[];
  variationGuidelines?: VariationGuidelinesEntry[];
}

function BrandIdentityCard({ brandName, brandUrl }: { brandName: string | null; brandUrl: string | null }) {
  if (!brandName && !brandUrl) return null;
  return (
    <div className="rounded-xl border border-stone-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-200 dark:border-zinc-800">
        <h2 className="text-xs font-bold uppercase tracking-wider text-brand">Brand Identity</h2>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {brandName && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Brand Name</p>
            <p className="text-sm font-medium">{brandName}</p>
          </div>
        )}
        {brandUrl && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Brand URL</p>
            <a
              href={brandUrl.startsWith("http") ? brandUrl : `https://${brandUrl}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand hover:underline break-all"
            >
              {brandUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BrandGuidelinesPage({
  clientIdCode,
  role,
  currentUserEmail,
  brandName,
  brandUrl,
  initialState,
}: {
  clientIdCode: string;
  role: Role;
  currentUserEmail: string;
  brandName?: string | null;
  brandUrl?: string | null;
  initialState: InitialState;
}) {
  const [state, setState] = useState(initialState);
  const canEdit = hasAdminPowers(role) || role === "editor";

  async function refresh() {
    const r = await fetch(`/api/clients/${clientIdCode}/brand-guidelines`);
    if (!r.ok) return;
    const data = await r.json();
    setState((prev) => ({
      bg: data.state ? { ...data.state } : null,
      activeVersion: data.activeVersion,
      versions: data.versions,
      notes: data.notes,
      logoFiles: data.logoFiles ?? prev.logoFiles,
      variationGuidelines: data.variationGuidelines ?? prev.variationGuidelines,
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageMetaSlot>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/clients/brand-guidelines"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
            title="Back to Brand Guidelines"
          >
            ←
          </Link>
          <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none shrink-0">
            <span className="font-bold text-sidebar-foreground">Brand</span><span className="font-normal text-brand">Guidelines</span>
          </h1>
          <span className="text-xs text-muted-foreground/70 truncate">
            {clientIdCode}&apos;s active brand book + team notes
          </span>
        </div>
      </PageMetaSlot>

      <BrandIdentityCard brandName={brandName ?? null} brandUrl={brandUrl ?? null} />

      <BrandBookCard
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        activeVersion={state.activeVersion}
        bg={state.bg}
        onChange={refresh}
      />

      <BrandLogoUploader
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        bg={state.bg}
        logoFiles={state.logoFiles}
        onChange={refresh}
      />

      <BrandSummaryCards
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        bg={state.bg}
        onChange={refresh}
      />

      <BrandNotesTimeline
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        notes={state.notes}
        currentUserEmail={currentUserEmail}
        isAdmin={hasAdminPowers(role)}
        onChange={refresh}
      />

      <BrandVersionHistory versions={state.versions} clientIdCode={clientIdCode} />

      <BrandMdPreview
        clientIdCode={clientIdCode}
        canEdit={canEdit}
        initialMd={state.activeVersion?.aiPreviewMd ?? null}
        activeVersionNumber={state.activeVersion?.versionNumber ?? null}
        lastUpdatedAt={state.bg?.updatedAt ?? null}
      />

      {state.variationGuidelines && state.variationGuidelines.length > 0 && (
        <VariationGuidelinesCard entries={state.variationGuidelines} />
      )}
    </div>
  );
}
