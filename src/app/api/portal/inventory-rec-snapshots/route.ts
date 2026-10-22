// Portal read path for sent inventory recommendations. src/proxy.ts only lets
// client/prospect sessions reach /api/portal/* (prospects GET-only), so the
// portal page reads here. All scoping stays in the hub handler: recReadScope
// gates the client code and portal callers get sentBy blanked.
import type { NextRequest } from "next/server";
import { GET as listSnapshots } from "@/app/api/inventory-rec-snapshots/route";

export function GET(req: NextRequest) {
  return listSnapshots(req);
}
