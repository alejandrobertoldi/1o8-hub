import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgPositions, users } from "@/lib/db/schema";
import { ORG_CHART_SEED, type SeedSeat } from "./org-chart-seed";

export type OrgSeat = {
  id: string;
  title: string;
  area: string | null;
  parentId: string | null;
  sortOrder: number;
  person: { id: string; name: string | null; email: string; image: string | null; jobTitle: string | null } | null;
};

/** Every seat, flat, in display order. The client nests them by parentId. */
export async function listOrgSeats(): Promise<OrgSeat[]> {
  const rows = await db
    .select({
      seat: orgPositions,
      person: { id: users.id, name: users.name, email: users.email, image: users.image, jobTitle: users.jobTitle, status: users.employmentStatus },
    })
    .from(orgPositions)
    .leftJoin(users, eq(users.id, orgPositions.userId))
    .orderBy(asc(orgPositions.sortOrder), asc(orgPositions.createdAt));
  return rows.map(({ seat, person }) => ({
    id: seat.id,
    title: seat.title,
    area: seat.area,
    parentId: seat.parentId,
    sortOrder: seat.sortOrder,
    // Someone who left the team (alumni) shows their seat as Open.
    person: person?.id && person.status === "active" ? { id: person.id, name: person.name, email: person.email, image: person.image, jobTitle: person.jobTitle } : null,
  }));
}

/**
 * Seeds org_positions from the 2026 Org Chart transcription, matching people
 * by name. Refuses to run when seats already exist unless `reset` is set, so
 * it can never wipe an admin's edits by accident.
 */
export async function seedOrgChart(opts: { reset?: boolean } = {}): Promise<{ seats: number; open: number; unmatched: string[] }> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(orgPositions);
  if (count > 0 && !opts.reset) throw new Error(`org_positions already has ${count} seats; pass --reset to replace them`);

  const people = await db.select({ id: users.id, name: users.name }).from(users);
  const byName = new Map(people.filter((p) => p.name).map((p) => [p.name!.trim().toLowerCase(), p.id]));
  const result = { seats: 0, open: 0, unmatched: [] as string[] };

  await db.transaction(async (tx) => {
    if (opts.reset) await tx.delete(orgPositions);
    const insert = async (seat: SeedSeat, parentId: string | null, sortOrder: number, area: string | null) => {
      const userId = seat.person ? byName.get(seat.person.toLowerCase()) ?? null : null;
      if (seat.person && !userId) result.unmatched.push(seat.person);
      if (!userId) result.open++;
      const seatArea = seat.area ?? area;
      const [row] = await tx
        .insert(orgPositions)
        .values({ title: seat.title, area: seatArea, parentId, userId, sortOrder })
        .returning({ id: orgPositions.id });
      result.seats++;
      for (const [i, child] of (seat.children ?? []).entries()) await insert(child, row.id, i, seatArea);
    };
    await insert(ORG_CHART_SEED, null, 0, null);
  });
  return result;
}
