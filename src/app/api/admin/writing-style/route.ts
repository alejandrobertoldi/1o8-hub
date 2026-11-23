export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { DEFAULT_STYLE_GUIDE } from "@/lib/client-report/default-style-guide";
import { getStyleGuide, reportRules, saveStyleGuide } from "@/lib/client-report/style-guide";

/** GET — 1o8's writing style guide, the default one, and the part the report writer uses. */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const guide = await getStyleGuide();
  return NextResponse.json({ ...guide, defaultText: DEFAULT_STYLE_GUIDE, reportRules: reportRules(guide.text) });
}

/** PUT { text } — saves the guide (an empty text goes back to the default). */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof body?.text !== "string" || body.text.length > 50_000) return NextResponse.json({ error: "text is required (max 50,000 characters)" }, { status: 400 });
  await saveStyleGuide(body.text, session.user.email ?? "");
  return NextResponse.json({ ok: true });
}
