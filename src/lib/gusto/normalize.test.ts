import { describe, expect, it } from "vitest";
import { normalizeBalances, normalizeEmployee, normalizeStatus, normalizeTimeOff } from "./normalize";

describe("normalizeTimeOff", () => {
  it("reads the v1 shape: days map of date → hours, nested employee, request_type", () => {
    const r = normalizeTimeOff({
      id: 52,
      status: "approved",
      employee: { uuid: "emp-1", full_name: "Tiffani Bassett" },
      request_type: "vacation",
      employee_note: "Family trip",
      days: { "2026-11-04": "8.000", "2026-11-03": "8.000", "2026-11-05": "0.000" },
    });
    expect(r).toEqual({
      externalId: "52",
      employeeUuid: "emp-1",
      status: "approved",
      kind: "vacation",
      startDate: "2026-11-03",
      endDate: "2026-11-05",
      days: ["2026-11-03", "2026-11-04"],
      hours: 16,
      note: "Family trip",
    });
  });

  it("reads start/end dates, a policy object and declined → denied", () => {
    const r = normalizeTimeOff({
      uuid: "req-9",
      employee_uuid: "emp-2",
      status: "declined",
      start_date: "2026-12-21",
      end_date: "2026-12-24",
      time_off_policy: { policy_type: "Sick" },
      hours: "24",
    });
    expect(r).toMatchObject({ externalId: "req-9", status: "denied", kind: "sick", startDate: "2026-12-21", endDate: "2026-12-24", days: null, hours: 24 });
  });

  it("drops rows without an id, employee, known status or dates", () => {
    expect(normalizeTimeOff({ status: "approved", employee_uuid: "e", start_date: "2026-01-01" })).toBeNull();
    expect(normalizeTimeOff({ id: 1, status: "weird", employee_uuid: "e", start_date: "2026-01-01" })).toBeNull();
    expect(normalizeTimeOff({ id: 1, status: "approved", employee_uuid: "e" })).toBeNull();
  });
});

describe("normalizeStatus", () => {
  it("maps Gusto's wording to the hub's statuses", () => {
    expect(normalizeStatus("Canceled")).toBe("cancelled");
    expect(normalizeStatus("requested")).toBe("pending");
    expect(normalizeStatus(undefined)).toBeNull();
  });
});

describe("normalizeEmployee", () => {
  it("collects every email lowercased", () => {
    expect(normalizeEmployee({ uuid: "e1", first_name: "Ana", last_name: "Ruiz", work_email: "Ana@1o8.agency", personal_email: "ana@gmail.com" })).toEqual({
      uuid: "e1",
      name: "Ana Ruiz",
      emails: ["ana@1o8.agency", "ana@gmail.com"],
    });
  });
});

describe("normalizeBalances", () => {
  it("accepts a flat list and a per-employee grouping", () => {
    expect(normalizeBalances([{ employee_uuid: "e1", policy_name: "PTO", policy_type: "vacation", balance: "40.5" }])).toEqual([
      { employeeUuid: "e1", policyName: "PTO", policyType: "vacation", hours: 40.5 },
    ]);
    expect(
      normalizeBalances({
        time_off_balances: [{ employee_uuid: "e2", time_off_balances: [{ time_off_policy: { name: "Sick", policy_type: "sick" }, balance: 16 }] }],
      }),
    ).toEqual([{ employeeUuid: "e2", policyName: "Sick", policyType: "sick", hours: 16 }]);
  });
});
