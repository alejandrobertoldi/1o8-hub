import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seoSettings } from "@/lib/db/schema";
import { getAuthSession } from "@/lib/auth-db";
import { eq } from "drizzle-orm";
import { hasAdminPowers } from "@/lib/roles";

const SETTINGS_KEY = "sales_summary_layout";

export type SalesSummaryLayout = {
  ordered: string[];
  hidden: string[];
};

const EMPTY: SalesSummaryLayout = { ordered: [], hidden: [] };

function parse(value: string | undefined | null): SalesSummaryLayout {
  if (!value) return EMPTY;
  try {
    const obj = JSON.parse(value);
    return {
      ordered: Array.isArray(obj?.ordered) ? obj.ordered.filter((x: unknown) => typeof x === "string") : [],
      hidden: Array.isArray(obj?.hidden) ? obj.hidden.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch {
    return EMPTY;
  }
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(seoSettings).where(eq(seoSettings.key, SETTINGS_KEY)).limit(1);
  return NextResponse.json(parse(rows[0]?.value));
}

export async function PUT(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Admin or editor only" }, { status: 403 });
  }
  const body = await req.json();
  const layout: SalesSummaryLayout = {
    ordered: Array.isArray(body?.ordered) ? body.ordered.filter((x: unknown) => typeof x === "string") : [],
    hidden: Array.isArray(body?.hidden) ? body.hidden.filter((x: unknown) => typeof x === "string") : [],
  };
  const value = JSON.stringify(layout);
  await db
    .insert(seoSettings)
    .values({ key: SETTINGS_KEY, value, updatedBy: session.user.email! })
    .onConflictDoUpdate({
      target: seoSettings.key,
      set: { value, updatedAt: new Date(), updatedBy: session.user.email! },
    });
  return NextResponse.json(layout);
}
