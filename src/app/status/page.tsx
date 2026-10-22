import { db } from "@/lib/db";
import { hubFeatures, type HubFeature } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform Status — 1o8 Hub",
  description: "Current development status of the 1o8 Hub platform.",
};

export function groupByStatus(features: HubFeature[]) {
  return {
    done: features.filter((f) => f.status === "done"),
    in_progress: features.filter((f) => f.status === "in_progress"),
    planned: features.filter((f) => f.status === "planned"),
  };
}

const domainColors: Record<string, string> = {
  SEO: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  "A+": "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30",
  Finance: "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30",
  Products: "bg-stone-100 text-stone-600 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
  Clients: "bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30",
  Portal: "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30",
  Admin: "bg-red-50 text-red-600 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
  Platform: "bg-stone-100 text-stone-600 border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700",
};

function DomainPill({ domain }: { domain: string }) {
  const cls = domainColors[domain] ?? domainColors.Platform;
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide border rounded px-1.5 py-0.5 ${cls}`}>
      {domain}
    </span>
  );
}

function FeatureCard({ feature }: { feature: HubFeature }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
      <DomainPill domain={feature.domain} />
      <div>
        <p className="text-sm font-semibold text-foreground leading-snug">{feature.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.description}</p>
      </div>
      {feature.status === "in_progress" && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${feature.progress}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
            {feature.progress}%
          </span>
        </div>
      )}
    </div>
  );
}

function StatusColumn({
  title,
  icon,
  features,
}: {
  title: string;
  icon: string;
  features: HubFeature[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground font-medium">
          {features.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {features.map((f) => (
          <FeatureCard key={f.id} feature={f} />
        ))}
        {features.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Nothing here yet.</p>
        )}
      </div>
    </div>
  );
}

export default async function StatusPage() {
  const features = await db
    .select()
    .from(hubFeatures)
    .orderBy(asc(hubFeatures.displayOrder));

  const { done, in_progress, planned } = groupByStatus(features);

  const latestUpdate = features.reduce<Date | null>((latest, f) => {
    return !latest || f.updatedAt > latest ? f.updatedAt : latest;
  }, null);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tighter">
            <span className="text-foreground">MF</span>
            <span className="text-brand">Hub</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform Status
            {latestUpdate && (
              <>
                {" · Last updated "}
                {latestUpdate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatusColumn title="Done" icon="✅" features={done} />
          <StatusColumn title="In Progress" icon="🔄" features={in_progress} />
          <StatusColumn title="Planned" icon="🗓" features={planned} />
        </div>
      </div>
    </div>
  );
}
