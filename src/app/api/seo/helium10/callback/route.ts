import { NextRequest, NextResponse } from "next/server";
import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { requireSeoReconnect } from "@/lib/helium10/access";
import { hubOrigin, withSharedConnection } from "@/lib/helium10/store";
import { consumeState } from "@/lib/helium10/credentials";
import { boundedFetch, SERVER_URL } from "@/lib/helium10/client";

export const maxDuration = 60;
export async function GET(req: NextRequest) {
  let target = "/seo/manager";
  try {
    const access = await requireSeoReconnect();
    if (access.error) return access.error;
    await withSharedConnection(async provider => {
      if (provider.data.pending?.authorizedBy !== access.userId) throw new Error("Authorization belongs to another user");
      const projectId = consumeState(provider.data, req.nextUrl.searchParams.get("state"));
      if (/^[0-9a-f-]{36}$/i.test(projectId)) target = `/seo/${projectId}/keywords`;
      const code = req.nextUrl.searchParams.get("code");
      if (!code || req.nextUrl.searchParams.has("error")) { delete provider.data.verifier; throw new Error("Authorization declined"); }
      try {
        const result = await auth(provider, { serverUrl: SERVER_URL, authorizationCode: code, fetchFn: boundedFetch });
        if (result !== "AUTHORIZED") throw new Error("Authorization incomplete");
      } finally { delete provider.data.verifier; }
    });
    return NextResponse.redirect(new URL(`${target}?helium10=connected`, hubOrigin()));
  } catch {
    return NextResponse.redirect(new URL(`${target}?helium10=error`, hubOrigin()));
  }
}
