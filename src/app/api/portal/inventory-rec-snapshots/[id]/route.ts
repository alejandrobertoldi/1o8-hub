// Portal read path for one sent snapshot (see ../route.ts for why it exists).
// The hub handler authorizes against the snapshot's own client code and strips
// rows to the portal allowlist (no note, no overrideQty).
import type { NextRequest } from "next/server";
import { GET as getSnapshot } from "@/app/api/inventory-rec-snapshots/[id]/route";

export function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return getSnapshot(req, ctx);
}
