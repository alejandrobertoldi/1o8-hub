import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers } from "@/lib/roles";
import { listMetaAdAccounts } from "@/lib/kpi/meta";
import { deleteSecret, metaProvider, saveSecret } from "@/lib/kpi/secrets";

/** POST { token } — save the Meta system user token after checking it can list ad accounts. */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (token.length < 20) return NextResponse.json({ error: "Paste the system user's access token" }, { status: 400 });
  try {
    const accounts = await listMetaAdAccounts(token);
    await saveSecret(metaProvider, token, session.user.id, { adAccounts: accounts.length });
    return NextResponse.json({ ok: true, adAccounts: accounts.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE — forget the Meta token. */
export async function DELETE() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteSecret(metaProvider);
  return NextResponse.json({ ok: true });
}
