import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { CalendarView } from "./_components/CalendarView";
import type { CalendarEvent } from "./_components/types";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const rows = await db
    .select({
      id: calendarEvents.id,
      legacyId: calendarEvents.legacyId,
      title: calendarEvents.title,
      startDate: calendarEvents.startDate,
      endDate: calendarEvents.endDate,
      type: calendarEvents.type,
      memberName: calendarEvents.memberName,
      description: calendarEvents.description,
    })
    .from(calendarEvents)
    .orderBy(asc(calendarEvents.startDate));

  const events: CalendarEvent[] = rows;

  return <CalendarView initialEvents={events} />;
}
