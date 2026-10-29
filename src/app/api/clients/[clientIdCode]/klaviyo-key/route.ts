import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import { checkKlaviyoKey } from "@/lib/kpi/klaviyo";
import { deleteSecret, klaviyoProvider, saveSecret, secretInfo } from "@/lib/kpi/secrets";

type Ctx = { params: Promise<{ clientIdCode: string }> };

/** GET — whether this client has a Klaviyo key (never the key). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const info = await secretInfo(klaviyoProvider((await params).clientIdCode));
  return NextResponse.json({ connected: !!info, updatedAt: info?.updatedAt ?? null, metrics: info?.meta.metrics ?? null });
}

/** POST { key } — save the client's read-only Klaviyo private key after checking it works. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Only admins can connect Klaviyo" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!/^pk_[A-Za-z0-9]+/.test(key)) return NextResponse.json({ error: "Paste a Klaviyo private API key (starts with pk_)" }, { status: 400 });
  try {
    const metrics = await checkKlaviyoKey(key);
    await saveSecret(klaviyoProvider((await params).clientIdCode), key, session.user.id, { metrics });
    return NextResponse.json({ ok: true, metrics });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE — remove the client's Klaviyo key. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteSecret(klaviyoProvider((await params).clientIdCode));
  return NextResponse.json({ ok: true });
}
