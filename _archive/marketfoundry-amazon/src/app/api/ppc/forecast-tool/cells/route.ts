/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { forecastToolCells } from "@/lib/db/schema";

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isEditorOrAbove(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { versionId, cells } = await req.json() as {
    versionId: string;
    cells: Array<{ month: string; metric: string; value: number | null }>;
  };

  if (!versionId || !cells?.length)
    return NextResponse.json({ error: "versionId and cells required" }, { status: 400 });

  for (const cell of cells) {
    await db
      .insert(forecastToolCells)
      .values({
        versionId,
        month: cell.month,
        metric: cell.metric,
        value: cell.value != null ? String(cell.value) : null,
      })
      .onConflictDoUpdate({
        target: [forecastToolCells.versionId, forecastToolCells.month, forecastToolCells.metric],
        set: { value: cell.value != null ? String(cell.value) : null },
      });
  }

  return NextResponse.json({ ok: true });
}
