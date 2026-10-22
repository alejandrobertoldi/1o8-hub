import { describe, it, expect } from "vitest";
import { INTERNAL_TEAMS } from "./constants";

describe("INTERNAL_TEAMS", () => {
  it("holds the three internal team codes shared by /admin/users and /team", () => {
    // Lifted out of admin/users/page.tsx so the matrix and the directory can
    // never disagree about what a clientIdCode of "1o8-marketplace" is called.
    // The VALUES are legacy 1o8-era keys stored in users.client_id_code and
    // must not be renamed — only the labels are brand-current.
    expect(INTERNAL_TEAMS.map((t) => t.value)).toEqual([
      "1o8-agency",
      "1o8-marketplace",
      "external",
    ]);
    expect(INTERNAL_TEAMS.find((t) => t.value === "1o8-marketplace")?.label).toBe(
      "1o8 Agency"
    );
  });
});
