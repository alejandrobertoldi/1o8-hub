import { describe, it, expect } from "vitest";
import {
  candidateAddressesFor,
  resolveAssigneeForProject,
  type AssigneeCandidateRow,
  type OrgProbe,
} from "./resolve-assignee";

/** Token slots, in asanaTokens() order: MF first, 1o8 second. */
const MF = 0;
const LEGACY = 1;

/**
 * Real rows measured in prod on 2026-08-04. Both twins carry the SAME stale
 * @pinwheel.agency asana_email, and NEITHER org recognises the other's address —
 * which is why one stored value cannot serve both orgs.
 */
const JO_ROWS: AssigneeCandidateRow[] = [
  { name: "Jo Carticiano", email: "carticiano@1o8.agency", asanaEmail: "carticiano@pinwheel.agency" },
  { name: "Jo Carticiano", email: "jo@marketfoundry.agency", asanaEmail: "carticiano@pinwheel.agency" },
];

/** Which addresses each org's token can actually see (from the prod probe). */
const ORG_MEMBERS: Record<number, string[]> = {
  [MF]: ["jo@marketfoundry.agency"],
  [LEGACY]: ["carticiano@pinwheel.agency"],
};

function probe(
  projectTokenIndex: number | null,
  members: Record<number, string[]> = ORG_MEMBERS
): OrgProbe {
  return {
    tokenIndexForProject: async () => projectTokenIndex,
    addressExistsForToken: async (email, tokenIndex) =>
      (members[tokenIndex] ?? []).includes(email),
  };
}

describe("resolveAssigneeForProject", () => {
  it("resolves one person to different addresses in different orgs", async () => {
    const inMf = await resolveAssigneeForProject("Jo Carticiano", "p-mf", JO_ROWS, probe(MF));
    const inLegacy = await resolveAssigneeForProject("Jo Carticiano", "p-1o8", JO_ROWS, probe(LEGACY));

    expect(inMf).toBe("jo@marketfoundry.agency");
    expect(inLegacy).toBe("carticiano@pinwheel.agency");
  });
});

describe("resolveAssigneeForProject determinism", () => {
  /**
   * db.select() has no ORDER BY, so the row order is heap order and any UPDATE to
   * a users row reshuffles it. When more than one of a person's addresses is valid
   * in the destination org, the answer must not depend on that order.
   */
  const TWIN_ROWS: AssigneeCandidateRow[] = [
    { name: "Twin Person", email: "twin@marketfoundry.agency", asanaEmail: null },
    {
      name: "Twin Person",
      email: "twin.person@1o8.agency",
      asanaEmail: "twin.person@marketfoundry.agency",
    },
  ];
  const BOTH_VALID: Record<number, string[]> = {
    [MF]: ["twin@marketfoundry.agency", "twin.person@marketfoundry.agency"],
    [LEGACY]: [],
  };

  it("returns the same address whatever order the rows arrive in", async () => {
    const forward = await resolveAssigneeForProject(
      "Twin Person",
      "p-mf",
      TWIN_ROWS,
      probe(MF, BOTH_VALID)
    );
    const reversed = await resolveAssigneeForProject(
      "Twin Person",
      "p-mf",
      [...TWIN_ROWS].reverse(),
      probe(MF, BOTH_VALID)
    );

    expect(forward).toBe(reversed);
  });

  it("prefers an explicitly curated asana_email over an email fallback", async () => {
    const picked = await resolveAssigneeForProject(
      "Twin Person",
      "p-mf",
      TWIN_ROWS,
      probe(MF, BOTH_VALID)
    );

    expect(picked).toBe("twin.person@marketfoundry.agency");
  });
});

describe("resolveAssigneeForProject skips rather than guessing", () => {
  it("returns null when the person has no identity in the destination org", async () => {
    // Real case: ruslan.makarenko@pinwheel.agency 404s in BOTH orgs.
    const rows: AssigneeCandidateRow[] = [
      {
        name: "Ruslan Makarenko",
        email: "ruslan.makarenko@1o8.agency",
        asanaEmail: "ruslan.makarenko@pinwheel.agency",
      },
    ];

    const picked = await resolveAssigneeForProject("Ruslan Makarenko", "p-1o8", rows, probe(LEGACY));

    expect(picked).toBeNull();
  });

  it("returns null for an AAC value that matches no user, without probing Asana", async () => {
    // AAC really contains "on Hold", "Imran", "Not doing Amazon" and a bare "Jake".
    let probeCalls = 0;
    const counting: OrgProbe = {
      tokenIndexForProject: async () => {
        probeCalls++;
        return MF;
      },
      addressExistsForToken: async () => {
        probeCalls++;
        return true;
      },
    };

    const picked = await resolveAssigneeForProject("on Hold", "p-mf", JO_ROWS, counting);

    expect(picked).toBeNull();
    expect(probeCalls).toBe(0);
  });

  it("returns null when no token can see the destination project", async () => {
    const picked = await resolveAssigneeForProject("Jo Carticiano", "p-gone", JO_ROWS, probe(null));

    expect(picked).toBeNull();
  });

  it("identifies a person by a stored asana_email, then re-resolves for the org", async () => {
    // The onboarding assignee dropdown sends `asanaEmail || email`, so the
    // identifier arriving from the UI can be the stale @pinwheel address. It must
    // still land on the address the destination org actually recognises.
    const picked = await resolveAssigneeForProject(
      "carticiano@pinwheel.agency",
      "p-mf",
      JO_ROWS,
      probe(MF)
    );

    expect(picked).toBe("jo@marketfoundry.agency");
  });

  it("expands from the matched row to the same person's other rows", async () => {
    // Amir's stale value sits ONLY on his @1o8 row; his MF row has asana_email
    // NULL. Matching just the row that literally carries the identifier would stop
    // there and find nothing usable in the MF org.
    const amirRows: AssigneeCandidateRow[] = [
      { name: "Amir Zeb", email: "amir@1o8.agency", asanaEmail: "amir@pinwheel.agency" },
      { name: "Amir Zeb", email: "amir@marketfoundry.agency", asanaEmail: null },
    ];
    const amirMembers: Record<number, string[]> = {
      [MF]: ["amir@marketfoundry.agency"],
      [LEGACY]: ["amir@pinwheel.agency"],
    };

    const picked = await resolveAssigneeForProject(
      "amir@pinwheel.agency",
      "p-mf",
      amirRows,
      probe(MF, amirMembers)
    );

    expect(picked).toBe("amir@marketfoundry.agency");
  });

  it("matches a person by email regardless of case", async () => {
    const picked = await resolveAssigneeForProject(
      "JO@MarketFoundry.Agency",
      "p-mf",
      JO_ROWS,
      probe(MF)
    );

    expect(picked).toBe("jo@marketfoundry.agency");
  });

  it("matches a person by email as well as by name", async () => {
    const picked = await resolveAssigneeForProject(
      "jo@marketfoundry.agency",
      "p-mf",
      JO_ROWS,
      probe(MF)
    );

    expect(picked).toBe("jo@marketfoundry.agency");
  });
});

describe("candidateAddressesFor", () => {
  it("collects every address belonging to the named person", () => {
    expect(new Set(candidateAddressesFor("Jo Carticiano", JO_ROWS))).toEqual(
      new Set(["carticiano@pinwheel.agency", "carticiano@1o8.agency", "jo@marketfoundry.agency"])
    );
  });
});
