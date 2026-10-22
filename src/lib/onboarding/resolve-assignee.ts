// src/lib/onboarding/resolve-assignee.ts
/**
 * Resolves an AAC person-name (AccountManager_MF / ExecutiveStrategist_MF) to the
 * Asana address that exists in the ORG THAT OWNS THE DESTINATION PROJECT.
 *
 * Why this cannot be a stored column: measured in prod on 2026-08-04, no address
 * exists in both orgs. Every @marketfoundry.agency address resolves in the
 * 1o8 org and 404s in 1o8; every @pinwheel.agency address does the
 * reverse. A single users.asana_email therefore cannot be correct for both, and
 * the hub writes assignees into both orgs (new client projects land in MF, the 24
 * legacy clients' projects are in 1o8).
 *
 * Caller supplies the candidate rows (all users rows) and an OrgProbe; this module
 * stays pure and does no I/O of its own.
 */

export interface AssigneeCandidateRow {
  name: string | null;
  email: string;
  asanaEmail: string | null;
}

export interface OrgProbe {
  /**
   * Index into the token list of the token that can see `projectGid`, i.e. the
   * token belonging to that project's org. null when no token can see it.
   */
  tokenIndexForProject(projectGid: string): Promise<number | null>;
  /** Whether `email` is a user visible to the token at `tokenIndex`. */
  addressExistsForToken(email: string, tokenIndex: number): Promise<boolean>;
}

/**
 * Every address that could stand for `name`, across all of that person's rows.
 * The rebrand left most people with two users rows (@1o8.agency and
 * @marketfoundry.agency), so a name legitimately maps to several addresses and the
 * org probe decides between them.
 */
export function candidateAddressesFor(
  identifier: string,
  rows: AssigneeCandidateRow[]
): string[] {
  const norm = (raw: string | null): string | null => raw?.trim().toLowerCase() || null;

  // `identifier` is whatever the caller holds: an AAC person-name, a hub email, or
  // an already-stored asana_email (which is what the onboarding assignee dropdown
  // sends). Any of the three identifies the person; the org probe then decides
  // which of that person's addresses is usable.
  const key = norm(identifier);
  const direct = rows.filter(
    (r) => r.name === identifier || norm(r.email) === key || norm(r.asanaEmail) === key
  );

  // Expand from the row that carried the identifier to every row for the SAME
  // PERSON. A stale asana_email usually sits on only one of a person's two rows,
  // so stopping at the direct match would never reach the other org's address.
  const names = new Set(direct.map((r) => r.name).filter((n): n is string => !!n));
  const matched = rows.filter((r) => direct.includes(r) || (r.name !== null && names.has(r.name)));
  const nonEmpty = (v: string | null): v is string => v !== null;

  // Curated asana_email values first, then email fallbacks, each sorted. The
  // rows arrive from an unordered db.select(), so anything that walked them in
  // arrival order would hand a different answer after any UPDATE to a users row.
  const curated = matched.map((r) => norm(r.asanaEmail)).filter(nonEmpty).sort();
  const fallback = matched.map((r) => norm(r.email)).filter(nonEmpty).sort();

  return [...new Set([...curated, ...fallback])];
}

/**
 * The address to assign, or null when the person has no identity in the
 * destination project's org. Returning null makes the caller skip the assignment,
 * which is correct: assigning an address the org cannot see fails anyway.
 */
export async function resolveAssigneeForProject(
  identifier: string,
  projectGid: string,
  rows: AssigneeCandidateRow[],
  probe: OrgProbe
): Promise<string | null> {
  const candidates = candidateAddressesFor(identifier, rows);
  if (!candidates.length) return null;

  const tokenIndex = await probe.tokenIndexForProject(projectGid);
  if (tokenIndex === null) return null;

  /* eslint-disable-next-line react-doctor/async-await-in-loop --
     sequential on purpose: stop at the first address the org recognises rather
     than firing a probe for every candidate. */
  for (const candidate of candidates) {
    if (await probe.addressExistsForToken(candidate, tokenIndex)) return candidate;
  }
  return null;
}
