import { describe, expect, it } from "vitest";
import { applyHolidayDealsLayout } from "./layout";

const clients = [
  { clientIdCode: "ZIN", clientName: "Zingora" },
  { clientIdCode: "BNU", clientName: "BNutty" },
  { clientIdCode: "REA", clientName: "ReadyRESCUE" },
  { clientIdCode: "POO", clientName: "Poochie Butter" },
];

describe("applyHolidayDealsLayout", () => {
  it("shows everyone alphabetically when nothing is configured", () => {
    expect(applyHolidayDealsLayout(clients, { ordered: [], hidden: [] }).map((c) => c.clientIdCode))
      .toEqual(["BNU", "POO", "REA", "ZIN"]);
  });

  it("drops hidden clients and keeps the configured order first", () => {
    const out = applyHolidayDealsLayout(clients, { ordered: ["REA", "ZIN"], hidden: ["BNU"] });
    expect(out.map((c) => c.clientIdCode)).toEqual(["REA", "ZIN", "POO"]);
  });

  it("ignores ordered or hidden codes that are not in the list", () => {
    const out = applyHolidayDealsLayout(clients, { ordered: ["GONE"], hidden: ["ALSO_GONE"] });
    expect(out).toHaveLength(4);
  });
});
