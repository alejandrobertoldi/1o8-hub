import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { hasAdminPowers, isHubStaff } from "@/lib/roles";
import { logEventAsync } from "@/lib/event-logger";
import { revealSharedLogin } from "@/lib/shared-logins/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isHubStaff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const revealed = await revealSharedLogin(id, {
    userId: session.user.id,
    isAdmin: hasAdminPowers(session.user.role),
  });
  if (revealed === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!revealed) {
    return NextResponse.json({ error: "Login not found" }, { status: 404 });
  }

  after(() =>
    logEventAsync({
      userEmail: session.user.email,
      userName: session.user.name,
      section: "admin",
      action: "shared-login:reveal",
      resourceType: "shared_login",
      resourceId: revealed.public.id,
      resourceLabel: revealed.public.name,
      message: `Revealed shared login ${revealed.public.name}`,
    })
  );

  const passwords =
    (revealed.secret.accountPasswords?.length ?? 0) > 0
      ? revealed.secret.accountPasswords
      : (revealed.secret.subscriptionPasswords?.length ?? 0) > 0
        ? revealed.secret.subscriptionPasswords.map(
            (group) => group.find(Boolean) || ""
          )
        : revealed.secret.password
          ? [revealed.secret.password]
          : [];
  const accounts = (revealed.public.accounts ?? []).map((account, index) => ({
    username: account.username,
    password: passwords[index] ?? "",
    subscriptions: account.subscriptions.map((subscription) => ({
      subscriptionId: subscription.subscriptionId,
      plan: subscription.plan,
      activationCode: subscription.activationCode,
      userLimit: subscription.userLimit,
    })),
  }));

  return NextResponse.json({
    id: revealed.public.id,
    password: accounts[0]?.password ?? passwords[0] ?? "",
    accounts,
  });
}
