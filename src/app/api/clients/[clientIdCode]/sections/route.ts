import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { aac, adminEventLog } from "@/lib/db/schema";
import { invalidateClientsCache } from "@/lib/clients-cache";
import { portalSectionDeltaIds, VALID_SECTION_IDS } from "@/lib/permissions";
import { hasAdminPowers } from "@/lib/roles";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientIdCode: string }> },
) {
  const session = await auth();
  if (!session || !hasAdminPowers(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body ?? {}) as { allowedSections?: unknown; sectionId?: unknown; enabled?: unknown };
  const validSet = new Set(VALID_SECTION_IDS);

  // Two accepted shapes:
  //
  //   { sectionId, enabled }        ← preferred. The next array is derived from the
  //                                  stored row inside the UPDATE, so two toggles
  //                                  seconds apart cannot clobber each other.
  //   { allowedSections: string[] } ← whole-array replace, for the explicit
  //                                  "configure sections" form that edits a draft.
  //
  // The array form is a read-modify-write across the network: callers built it from
  // the /api/clients payload, which is served from a 60s process-local cache, so a
  // second click inside that window reverted the first. Use the delta for toggles.
  let setAllowedSections: string[] | ReturnType<typeof sql>;
  let logMessage: string;
  let logDetail: Record<string, unknown>;

  if (raw.sectionId !== undefined) {
    const sectionId = raw.sectionId;
    if (typeof sectionId !== "string" || !validSet.has(sectionId)) {
      return NextResponse.json(
        { error: `Invalid section ID: ${String(sectionId)}` },
        { status: 400 },
      );
    }
    if (typeof raw.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    // Parent department toggles (e.g. `design`) also grant/revoke their
    // landing-page children. array_remove-then-append is idempotent and
    // duplicate-free; chaining keeps the write lost-update-safe.
    const deltaIds = portalSectionDeltaIds(sectionId);
    setAllowedSections = raw.enabled
      ? deltaIds.reduce(
          (expr, id) => sql`array_append(array_remove(${expr}, ${id}), ${id})`,
          sql`${aac.allowedSections}`,
        )
      : deltaIds.reduce(
          (expr, id) => sql`array_remove(${expr}, ${id})`,
          sql`${aac.allowedSections}`,
        );
    logMessage = `${raw.enabled ? "Enabled" : "Disabled"} portal section ${sectionId}`;
    logDetail = { sectionId, enabled: raw.enabled, ids: deltaIds };
  } else {
    const allowedSections = raw.allowedSections;
    if (!Array.isArray(allowedSections) || !allowedSections.every((s) => typeof s === "string")) {
      return NextResponse.json(
        { error: "allowedSections must be an array of strings" },
        { status: 400 },
      );
    }
    const invalid = allowedSections.filter((s) => !validSet.has(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid section IDs: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
    setAllowedSections = allowedSections;
    logMessage = `Updated portal section visibility (${allowedSections.length} sections)`;
    logDetail = { allowedSections };
  }

  const result = await db
    .update(aac)
    .set({ allowedSections: setAllowedSections, updatedAt: new Date() })
    .where(eq(aac.clientIdCode, clientIdCode))
    .returning({ clientIdCode: aac.clientIdCode, allowedSections: aac.allowedSections });

  if (result.length === 0) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // allowedSections ships in the /api/clients payload.
  invalidateClientsCache();

  await db.insert(adminEventLog).values({
    userEmail: session.user?.email ?? null,
    userName: session.user?.name ?? null,
    section: "clients",
    action: "portal.sections.update",
    status: "success",
    resourceType: "client",
    resourceId: clientIdCode,
    resourceLabel: clientIdCode,
    message: logMessage,
    detail: logDetail,
  }).catch(() => {}); // best-effort logging

  return NextResponse.json(result[0]);
}
