import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only pending users can register
  if (session.user.role !== "pending") {
    return NextResponse.json({ error: "Already registered" }, { status: 400 });
  }

  const body = await req.json();
  const { fullName, clientName } = body as {
    fullName: string;
    clientName: string;
  };

  if (!fullName?.trim() || !clientName?.trim()) {
    return NextResponse.json(
      { error: "Full name and client are required" },
      { status: 400 }
    );
  }

  // Store client name in clientIdCode field for admin to review and map
  await db
    .update(users)
    .set({
      name: fullName.trim(),
      clientIdCode: clientName.trim(),
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}
