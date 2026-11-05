import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DEV_LOGIN_ENABLED } from "@/lib/auth";

/** GET — local users for the dev sign-in "Sign in as" picker. Dev server only (404 elsewhere). */
export async function GET() {
  if (!DEV_LOGIN_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await db.select({ email: users.email, name: users.name, role: users.role }).from(users).orderBy(asc(users.name));
  return NextResponse.json(rows);
}
