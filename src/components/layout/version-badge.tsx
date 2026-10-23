/**
 * Which build is open: commit + build time, bottom right. Lets QA tell whether
 * Vercel already published the latest push without opening Vercel.
 * Values are baked in at build time (next.config.ts `env`).
 */
export function VersionBadge() {
  const commit = process.env.NEXT_PUBLIC_DEPLOY_COMMIT ?? "local";
  const built = process.env.NEXT_PUBLIC_BUILD_TIME;
  const when = built
    ? new Date(built).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
    : "";
  return (
    <div
      className="pointer-events-none fixed bottom-1.5 right-2 z-40 select-text rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70 backdrop-blur-sm print:hidden"
      title={`Commit ${commit}${built ? ` · built ${built}` : ""}`}
    >
      {commit === "local" ? "local build" : `v ${commit}`}
      {when && ` · ${when} CT`}
    </div>
  );
}
