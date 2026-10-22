// Which phase cards are open after the current phase moves (a phase was just approved):
// the approved card closes and the next one opens. S6 → "S7" (sent for review) keeps S6 open,
// because S7 Review & Share / S8 Push live inside the S6 card.
export function openAfterApproval(open: ReadonlySet<string>, previous: string, current: string): Set<string> {
  const next = new Set(open);
  if (current === "S7") return next;
  next.delete(previous);
  next.add(current);
  return next;
}
