/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { forecastToolAsinCells } from "@/lib/db/schema";

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { asinId, cells } = await req.json() as {
    asinId: string;
    cells: Array<{ month: string; metric: string; value: number | null }>;
  };

  if (!asinId || !cells?.length)
    return NextResponse.json({ error: "asinId and cells required" }, { status: 400 });

  for (const cell of cells) {
    await db
      .insert(forecastToolAsinCells)
      .values({
        asinId,
        month: cell.month,
        metric: cell.metric,
        value: cell.value != null ? String(cell.value) : null,
      })
      .onConflictDoUpdate({
        target: [forecastToolAsinCells.asinId, forecastToolAsinCells.month, forecastToolAsinCells.metric],
        set: { value: cell.value != null ? String(cell.value) : null },
      });
  }

  return NextResponse.json({ ok: true });
}
