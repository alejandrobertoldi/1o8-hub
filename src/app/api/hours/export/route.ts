import { NextRequest, NextResponse } from "next/server";
import { isValidDateString } from "@/lib/hours/validation";
import { listEntries } from "@/lib/hours/queries";
import {
  generateHoursXlsx,
  hoursExportFilename,
  toHoursExportEntry,
} from "@/lib/hours/export";
import { requireTeamUser } from "../route";

export async function GET(req: NextRequest) {
  const auth = await requireTeamUser();
  if (auth instanceof NextResponse) return auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to || !isValidDateString(from) || !isValidDateString(to)) {
    return NextResponse.json(
      { error: "from and to are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "from must be on or before to" },
      { status: 400 }
    );
  }

  // Owner-only, same contract as GET /api/hours — any userId param is ignored.
  const rows = await listEntries(auth.user.id, from, to);
  const buffer = generateHoursXlsx(rows.map(toHoursExportEntry));
  const filename = hoursExportFilename(from, to);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
