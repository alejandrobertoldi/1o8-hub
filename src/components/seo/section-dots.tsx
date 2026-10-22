import { postS6Dots } from "@/lib/seo/post-s6-phases";
import type { TrailRow } from "@/lib/seo/phase-trail";
import { TrailStages, TrailWho } from "./phase-trail";

export const SECTIONS = [
  { key: "s1", code: "S1", label: "Intake" },
  { key: "s2", code: "S2", label: "Keywords" },
  { key: "s3", code: "S3", label: "Reviews" },
  { key: "s4", code: "S4", label: "Alexa for Shopping" },
  { key: "s5", code: "S5", label: "COSMO" },
  { key: "s6", code: "S6", label: "SEO Content" },
];

interface ProjectWithPhases {
  current_phase: string;
  s1_approved_at: string | null;
  s2_approved_at: string | null;
  s3_approved_at: string | null;
  s4_approved_at: string | null;
  s5_approved_at: string | null;
  s6_approved_at: string | null;
  /** When the API provides these, S7 Review & Share and S8 Push Content dots are shown too. */
  review_approved?: boolean;
  review_stage?: string | null;
  pushed?: boolean;
}

const DOT = {
  done: { code: "text-emerald-600 dark:text-emerald-500/70", box: "bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30" },
  active: { code: "text-amber-600 dark:text-amber-500/70", box: "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30" },
  pending: { code: "text-stone-400 dark:text-zinc-700", box: "bg-stone-200 text-stone-500 border border-stone-300 dark:bg-zinc-800/50 dark:text-zinc-600 dark:border-zinc-800" },
};

type DotItem = { code: string; label: string; state: "done" | "active" | "pending"; n: number };

/** vertical: one labelled row per phase; with `trail`, each row also shows who / when and S7 its review stages. */
export function SectionDots({ project, vertical = false, trail }: { project: ProjectWithPhases; vertical?: boolean; trail?: TrailRow[] }) {
  const items: DotItem[] = SECTIONS.map((s, i) => {
    const isApproved = !!project[`${s.key}_approved_at` as keyof ProjectWithPhases];
    const isCurrent = project.current_phase === s.code;
    return { code: s.code, label: s.label, state: isApproved ? "done" : isCurrent ? "active" : "pending", n: i + 1 };
  });
  if (project.review_approved !== undefined) {
    const d = postS6Dots({ s6Approved: !!project.s6_approved_at, reviewApproved: !!project.review_approved, inReview: !!project.review_stage, pushed: !!project.pushed });
    items.push({ code: "S7", label: "Review & Share", state: d.S7, n: 7 }, { code: "S8", label: "Push Content", state: d.S8, n: 8 });
  }
  const box = (it: DotItem) => (
    <div className={`size-5 shrink-0 rounded flex items-center justify-center text-[8px] font-bold transition-colors ${DOT[it.state].box}`}>
      {it.state === "done" ? "\u2713" : it.n}
    </div>
  );

  if (vertical) {
    return (
      <ol className="space-y-1" aria-label="Phases">
        {items.map((it) => {
          const row = trail?.find((r) => r.code === it.code);
          return (
            <li key={it.code}>
              <div className="flex items-center gap-2">
                {box(it)}
                <span className={`w-5 text-[9px] font-bold ${DOT[it.state].code}`}>{it.code}</span>
                <span className={`text-[11px] ${trail ? "w-32 shrink-0" : ""} ${it.state === "pending" ? "text-muted-foreground" : "text-foreground"}`}>{it.label}</span>
                {trail && <TrailWho code={it.code} row={row} />}
              </div>
              {trail && it.code === "S7" && <div className="mt-0.5"><TrailStages stages={row?.stages ?? []} /></div>}
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {items.map((it) => (
        <div key={it.code} className="flex flex-col items-center gap-0.5">
          <span className={`text-[8px] font-bold leading-none ${DOT[it.state].code}`}>{it.code}</span>
          {box(it)}
        </div>
      ))}
    </div>
  );
}
