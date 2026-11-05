"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ClipboardList, Sparkles } from "lucide-react";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { AiConfig } from "@/components/admin/ai-config";
import { AsanaTemplateConfig } from "@/components/admin/asana-template-config";
import { hasAdminPowers } from "@/lib/roles";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "ai", label: "AI models & prompts", icon: Sparkles },
  { key: "asana", label: "Asana project template", icon: ClipboardList },
] as const;

/** Admin settings in one place: the AI features' models and prompts, and the client Asana project template. */
export default function AdminConfigPage() {
  return (
    <Suspense fallback={null}>
      <AdminConfig />
    </Suspense>
  );
}

function AdminConfig() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "asana" ? "asana" : "ai";

  if (status === "loading") return null;
  if (!hasAdminPowers(session?.user?.role)) {
    return <div className="p-8 text-sm text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="space-y-6">
      <PageMetaSlot>
        <h1 className="text-[2.2rem] font-[family-name:var(--font-outfit)] tracking-tighter leading-none" aria-label="Configuration">
          <span className="font-bold text-sidebar-foreground">Config</span>
          <span className="font-normal text-brand">uration</span>
        </h1>
      </PageMetaSlot>
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Configuration sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => router.replace(`/admin/config?tab=${t.key}`, { scroll: false })}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              tab === t.key ? "border-brand font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "ai" ? <AiConfig /> : <AsanaTemplateConfig />}
    </div>
  );
}
