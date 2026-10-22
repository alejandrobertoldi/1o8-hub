import type { TrailRow, TrailStage, TrailState } from "@/lib/seo/phase-trail";

const STAGE_STYLE: Record<TrailState, { mark: string; cls: string }> = {
  done: { mark: "✓", cls: "text-emerald-600 dark:text-emerald-400" },
  waiting: { mark: "•", cls: "text-amber-600 dark:text-amber-400" },
  changes: { mark: "↺", cls: "text-red-500" },
  pending: { mark: "–", cls: "text-muted-foreground" },
};
const STAGE_NOTE: Record<TrailState, string> = { done: "", waiting: "waiting", changes: "changes requested", pending: "not yet" };

/** "who · when" for one phase row (S7 shows its stages underneath instead). */
export function TrailWho({ code, row }: { code: string; row: TrailRow | undefined }) {
  if (code === "S7") return null;
  return row?.who
    ? <span className="truncate text-[11px] text-foreground">{row.who}<span className="text-muted-foreground"> · {row.at}</span></span>
    : <span className="text-[11px] text-muted-foreground">—</span>;
}

/** The S7 review stages: person per stage with done / waiting / changes / not yet. */
export function TrailStages({ stages }: { stages: TrailStage[] }) {
  if (!stages.length) return <p className="ml-14 text-[10px] text-muted-foreground">No review yet</p>;
  return (
    <ul className="ml-14 space-y-0.5 border-l border-border pl-2" aria-label="Review stages">
      {stages.map((s) => (
        <li key={s.title} className="flex items-center gap-1.5 text-[10px]">
          <span className={`w-3 text-center font-bold ${STAGE_STYLE[s.state].cls}`}>{STAGE_STYLE[s.state].mark}</span>
          <span className="w-24 shrink-0 text-muted-foreground">{s.title}</span>
          <span className="truncate text-foreground">{s.who}</span>
          <span className={STAGE_STYLE[s.state].cls}>{s.at ? `· ${s.at}` : STAGE_NOTE[s.state] && `· ${STAGE_NOTE[s.state]}`}</span>
        </li>
      ))}
    </ul>
  );
}
