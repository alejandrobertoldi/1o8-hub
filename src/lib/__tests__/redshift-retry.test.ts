import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const release = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    on() {}
    async connect() {
      return { query, release };
    }
  },
}));

import { queryRedshiftOrThrow } from "../redshift";

describe("queryRedshiftOrThrow retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      REDSHIFT_HOST: "h",
      REDSHIFT_DATABASE: "d",
      REDSHIFT_USER: "u",
      REDSHIFT_PASSWORD: "p",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("retries once by default", async () => {
    query.mockRejectedValueOnce(new Error("stale")).mockResolvedValueOnce({ rows: [{ x: 1 }] });
    await expect(queryRedshiftOrThrow("select 1")).resolves.toEqual([{ x: 1 }]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("does not retry when retry is false, so a timed-out heavy scan is not re-run", async () => {
    query.mockRejectedValue(new Error("Query read timeout"));
    await expect(queryRedshiftOrThrow("select 1", [], { retry: false })).rejects.toThrow(
      "Query read timeout",
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
