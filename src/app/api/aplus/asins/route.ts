import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse } from "next/server";
import { queryBigQuery } from "@/lib/bigquery";
import { seoOutPaPlusTable } from "@/lib/bq-datasets";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

// OUT_PA+ table name contains a `+`; the whole FQN is wrapped in a single
// backtick pair at the call site below (valid BigQuery for special-char ids).
// Dataset/project/table are env-driven — see src/lib/bq-datasets.ts. Values
// were inferred (unverified) pre-migration; smoke-test after any re-point.

interface OutPaPlusAsinRow {
  ASIN: string;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json(
      { error: "clientIdCode is required" },
      { status: 400 }
    );
  }

  try {
    const rows = await queryBigQuery<OutPaPlusAsinRow>(
      `SELECT DISTINCT ASIN FROM \`${seoOutPaPlusTable()}\` WHERE ClientIDCode = @clientIdCode ORDER BY ASIN`,
      { clientIdCode }
    );

    const asins = rows.map((r) => r.ASIN).filter(Boolean);

    return NextResponse.json({ asins });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch ASINs from BigQuery",
      },
      { status: 500 }
    );
  }
}
