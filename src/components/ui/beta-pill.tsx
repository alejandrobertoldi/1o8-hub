// Marks a section that is still changing, so the team doesn't treat its numbers as final.
export function BetaPill({ className = "" }: { className?: string }) {
  return (
    <span
      title="Beta: this section is still being built and may change"
      className={`inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-bold uppercase leading-none tracking-wider text-amber-700 dark:text-amber-400 ${className}`}
    >
      Beta
    </span>
  );
}
