/** When a design version is marked Live, previous versions and any other
 *  currently-Live siblings become Discontinued (the UI label for this status). */

export function siblingShouldBecomeDiscontinued(args: {
  siblingVersionNumber: number;
  siblingStatus: string;
  liveVersionNumber: number;
}): boolean {
  if (args.siblingStatus === "discontinued") return false;
  return (
    args.siblingVersionNumber < args.liveVersionNumber ||
    args.siblingStatus === "live"
  );
}
