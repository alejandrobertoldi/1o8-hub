import { describe, expect, it } from "vitest";
import { HUB_TIME_OFF_PROP, eventForTimeOff, teamEventFromGoogle } from "./calendar-events";

describe("eventForTimeOff", () => {
  it("is an all-day, free event with an exclusive end date and the hub's id", () => {
    const e = eventForTimeOff({ id: "r1", userName: "Tiffani Bassett", startDate: "2026-11-03", endDate: "2026-11-04", source: "gusto", kind: "sick" });
    expect(e.summary).toBe("Tiffani Bassett Sick");
    expect(e.start).toEqual({ date: "2026-11-03" });
    expect(e.end).toEqual({ date: "2026-11-05" });
    expect(e.transparency).toBe("transparent");
    expect(e.extendedProperties?.private?.[HUB_TIME_OFF_PROP]).toBe("r1");
  });
});

describe("teamEventFromGoogle", () => {
  it("turns an all-day event's exclusive end into an inclusive date", () => {
    const e = teamEventFromGoogle(
      { id: "a", summary: "Aubrey PTO", start: { date: "2026-12-21" }, end: { date: "2026-12-25" }, creator: { email: "Aubrey@1o8.agency" } },
      "America/Chicago",
    );
    expect(e).toMatchObject({ allDay: true, startDate: "2026-12-21", endDate: "2026-12-24", creatorEmail: "aubrey@1o8.agency" });
  });

  it("dates a part-day event in its own time zone", () => {
    const e = teamEventFromGoogle(
      {
        id: "b",
        summary: "JMann Unavailable",
        start: { dateTime: "2026-09-01T22:00:00-05:00", timeZone: "America/Chicago" },
        end: { dateTime: "2026-09-02T00:00:00-05:00", timeZone: "America/Chicago" },
      },
      "America/Chicago",
    );
    // Ends exactly at midnight: covers only the 1st.
    expect(e).toMatchObject({ allDay: false, startDate: "2026-09-01", endDate: "2026-09-01" });
  });

  it("skips events the hub published and cancelled ones", () => {
    expect(teamEventFromGoogle({ id: "c", start: { date: "2026-01-01" }, extendedProperties: { private: { [HUB_TIME_OFF_PROP]: "r1" } } }, "UTC")).toBeNull();
    expect(teamEventFromGoogle({ id: "d", status: "cancelled", start: { date: "2026-01-01" } }, "UTC")).toBeNull();
  });
});
