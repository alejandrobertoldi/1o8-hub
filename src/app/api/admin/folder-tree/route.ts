import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { folderTreeConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CLIENT_FOLDER_TREE, type FolderNode } from "@/lib/onboarding/folder-tree";
import { badRequest, forbidden, unauthorized } from "@/lib/api-utils";
import { hasAdminPowers } from "@/lib/roles";

function isValidNode(n: unknown): n is FolderNode {
  if (!n || typeof n !== "object") return false;
  const o = n as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) return false;
  if (typeof o.type !== "string" || !o.type.trim()) return false;
  if (o.children !== undefined) {
    if (!Array.isArray(o.children)) return false;
    if (!o.children.every(isValidNode)) return false;
  }
  return true;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!hasAdminPowers(session.user.role)) return forbidden();

  const [row] = await db
    .select({ tree: folderTreeConfig.tree, updatedAt: folderTreeConfig.updatedAt, updatedBy: folderTreeConfig.updatedBy })
    .from(folderTreeConfig)
    .where(eq(folderTreeConfig.id, 1))
    .limit(1);

  if (!row) {
    // Seed from the static default and return that
    return NextResponse.json({ tree: CLIENT_FOLDER_TREE, source: "default", updatedAt: null, updatedBy: null });
  }

  return NextResponse.json({
    tree: row.tree as FolderNode[],
    source: "db",
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();
  if (!hasAdminPowers(session.user.role)) return forbidden();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON"); }
  const tree = (body as { tree?: unknown })?.tree;
  if (!Array.isArray(tree) || !tree.every(isValidNode)) {
    return badRequest("Tree must be a FolderNode[] — each node needs name, type, and optional children[]");
  }

  // Reject duplicate types within the whole tree (types are used for DB lookups)
  const types: string[] = [];
  function collect(nodes: FolderNode[]) {
    for (const n of nodes) {
      types.push(n.type);
      if (n.children?.length) collect(n.children);
    }
  }
  collect(tree as FolderNode[]);
  const duplicates = types.filter((t, i) => types.indexOf(t) !== i);
  if (duplicates.length) {
    return badRequest(`Duplicate folder types: ${[...new Set(duplicates)].join(", ")}. Each type must be unique.`);
  }

  const updatedBy = session.user.email ?? session.user.name ?? "unknown";

  await db
    .insert(folderTreeConfig)
    .values({ id: 1, tree: tree as FolderNode[], updatedBy })
    .onConflictDoUpdate({
      target: folderTreeConfig.id,
      set: { tree: tree as FolderNode[], updatedAt: new Date(), updatedBy },
    });

  return NextResponse.json({ success: true, updatedBy });
}
