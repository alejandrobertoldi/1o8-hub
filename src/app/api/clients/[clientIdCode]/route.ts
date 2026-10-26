import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, aac, adminEventLog, clientGanttTasks, clientOnboardingSteps, users, spApiCredentials, clientForecasts, inventoryRecSettings, driveFolders } from "@/lib/db/schema";
import { sql, eq, and, ne, isNull } from "drizzle-orm";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";
import { STEP_TO_ASANA_TASK, findAsanaTaskInProject, updateAsanaTaskAssignee, createAsanaOrgProbe } from "@/lib/onboarding/create-asana-project";
import { resolveAssigneeForProject } from "@/lib/onboarding/resolve-assignee";
import { updateAacFieldInBigQuery } from "@/lib/bigquery";
import { invalidateClientsCache } from "@/lib/clients-cache";
import { driveClient } from "@/lib/drive-client";
import { resolveClientFolderParent } from "@/lib/onboarding/client-folder-routing";
import { queueAacSheetPush } from "@/lib/aac-sync/hooks";

// Shared drive root — client folders live here when active; passed to the
// status→folder resolver as the default/Active destination.
const ACTIVE_CLIENTS_FOLDER_ID = process.env.GOOGLE_SHARED_DRIVE_ID!;

// ── AAC field sync ──────────────────────────────────────────────────────────
// A handful of `aac` fields live in BOTH a typed column AND the `raw_data` JSONB
// mirror that the AAC Table reads first. Every write path must keep the column,
// the JSONB mirror, and BigQuery in agreement or the views drift (this is how the
// ClientStatus "Prospect vs Active" desync happened: the PATCH path wrote the
// column but not the mirror). This helper is the single source of that mapping so
// PUT (inline cell editor) and PATCH (Edit-Client dialog) can't diverge again.

type AacColumnPayload = {
  clientName?: string;
  clientStatus?: string;
  powerbiEmbedUrl?: string;
  onboardingDate?: Date | null;
  offboardingDate?: Date | null;
};

export const INACTIVE_OFFBOARDING_ERROR =
  "An offboarding date is required to mark a client Inactive.";

function hasOffboardingDate(value: string | Date | null | undefined): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim().length > 0;
}

/**
 * Inactive clients must have an offboarding date. Call this only when the
 * request is changing ClientStatus or OffboardingDate — unrelated edits on a
 * legacy Inactive row without a date should still save.
 */
export function inactiveRequiresOffboardingDate(args: {
  nextStatus?: string;
  nextOffboardingDate?: string;
  existingStatus?: string | null;
  existingOffboardingDate?: string | Date | null;
}): string | null {
  const status = (args.nextStatus ?? args.existingStatus ?? "").trim();
  if (status.toLowerCase() !== "inactive") return null;

  const offboarding =
    args.nextOffboardingDate !== undefined
      ? args.nextOffboardingDate
      : args.existingOffboardingDate;
  if (hasOffboardingDate(offboarding)) return null;
  return INACTIVE_OFFBOARDING_ERROR;
}

/**
 * Merge raw-key edits into rawData and derive the typed-column overrides they
 * imply. Returns the merged rawData, the column payload to persist alongside it,
 * and the (field, value) pairs the caller must sync to BigQuery. Raw keys with no
 * typed column (e.g. "Tier") still update the JSONB mirror + BigQuery.
 */
export function buildAacFieldSync(
  existingRaw: Record<string, string>,
  edits: Array<{ rawKey: string; value: string }>
): {
  rawData: Record<string, string>;
  columns: AacColumnPayload;
  bqFields: Array<{ field: string; value: string }>;
} {
  const rawData = { ...existingRaw };
  const columns: AacColumnPayload = {};
  const bqFields: Array<{ field: string; value: string }> = [];

  for (const { rawKey, value } of edits) {
    rawData[rawKey] = value;
    bqFields.push({ field: rawKey, value });
    switch (rawKey) {
      case "ClientName":
        columns.clientName = value;
        break;
      case "ClientStatus":
        columns.clientStatus = value;
        break;
      case "PowerBIEmbedURL":
        columns.powerbiEmbedUrl = value;
        break;
      case "OnboardingDate":
        columns.onboardingDate = value ? new Date(value + "T00:00:00Z") : null;
        break;
      case "OffboardingDate":
        columns.offboardingDate = value ? new Date(value + "T00:00:00Z") : null;
        break;
    }
  }

  return { rawData, columns, bqFields };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientIdCode } = await params;

  // Fetch client row
  const [client] = await db
    .select()
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Parse rawData (handle double-stringified JSON)
  let rawData: Record<string, string> = {};
  if (typeof client.rawData === "string") {
    try {
      rawData = JSON.parse(client.rawData);
    } catch {
      /* ignore */
    }
  } else if (client.rawData) {
    rawData = client.rawData as Record<string, string>;
  }

  // Fetch product stats
  const [stats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      activeCount: sql<number>`count(*) FILTER (WHERE ${master.status} ILIKE 'active')::int`,
      inactiveCount: sql<number>`count(*) FILTER (WHERE ${master.status} ILIKE 'inactive')::int`,
      outOfStockCount: sql<number>`count(*) FILTER (WHERE ${master.status} ILIKE 'out of stock')::int`,
      closedCount: sql<number>`count(*) FILTER (WHERE ${master.status} ILIKE 'closed')::int`,
      incompleteCount: sql<number>`count(*) FILTER (WHERE ${master.status} ILIKE 'incomplete')::int`,
      discontinuedCount: sql<number>`count(*) FILTER (WHERE ${master.status} ILIKE 'discontinued')::int`,
      replacementCount: sql<number>`count(*) FILTER (WHERE ${master.status} ILIKE 'replacement%')::int`,
    })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  const statusBreakdown: Record<string, number> = {
    Active: stats?.activeCount ?? 0,
    Inactive: stats?.inactiveCount ?? 0,
    "Out of Stock": stats?.outOfStockCount ?? 0,
    Closed: stats?.closedCount ?? 0,
    Incomplete: stats?.incompleteCount ?? 0,
    Discontinued: stats?.discontinuedCount ?? 0,
    "Replacement ASIN": stats?.replacementCount ?? 0,
  };

  // DB column is always the source of truth for OnboardingDate / OffboardingDate
  rawData["OnboardingDate"] = client.onboardingDate
    ? client.onboardingDate.toISOString().split("T")[0]
    : (rawData["OnboardingDate"] ?? "");
  rawData["OffboardingDate"] = client.offboardingDate
    ? client.offboardingDate.toISOString().split("T")[0]
    : (rawData["OffboardingDate"] ?? "");

  return NextResponse.json({
    client: {
      id: client.id,
      clientIdCode: client.clientIdCode,
      clientStatus: client.clientStatus,
      clientName: client.clientName,
      clientType: client.clientType ?? null,
      updatedAt: client.updatedAt,
    },
    rawData,
    productStats: {
      count: stats?.count ?? 0,
      activeCount: stats?.activeCount ?? 0,
      statusBreakdown,
    },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string })?.role;
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const body = await req.json();
  const { field, value } = body as { field: string; value: string; offboardingDate?: string };
  const extraOffboarding =
    typeof body.offboardingDate === "string" ? body.offboardingDate : undefined;

  if (typeof field !== "string" || typeof value !== "string") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Fetch current row
  const [client] = await db
    .select()
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Parse existing rawData
  let rawData: Record<string, string> = {};
  if (typeof client.rawData === "string") {
    try {
      rawData = JSON.parse(client.rawData);
    } catch {
      /* ignore */
    }
  } else if (client.rawData) {
    rawData = client.rawData as Record<string, string>;
  }

  const oldValue = rawData[field] ?? "";

  if (field === "ClientStatus" || field === "OffboardingDate") {
    const gateError = inactiveRequiresOffboardingDate({
      nextStatus: field === "ClientStatus" ? value : undefined,
      nextOffboardingDate: field === "OffboardingDate" ? value : extraOffboarding,
      existingStatus: client.clientStatus,
      existingOffboardingDate: client.offboardingDate ?? rawData["OffboardingDate"],
    });
    if (gateError) {
      return NextResponse.json({ error: gateError }, { status: 400 });
    }
  }

  // Merge the field + derive typed-column mirrors via the shared sync helper so
  // the JSONB mirror, typed columns, and BigQuery stay in agreement.
  const edits: Array<{ rawKey: string; value: string }> = [{ rawKey: field, value }];
  if (field === "ClientStatus" && extraOffboarding !== undefined) {
    edits.push({ rawKey: "OffboardingDate", value: extraOffboarding });
  }
  const { rawData: mergedRaw, columns, bqFields } = buildAacFieldSync(rawData, edits);

  const updatePayload = {
    ...columns,
    rawData: mergedRaw,
    updatedAt: new Date(),
  };

  const startMs = Date.now();

  await db
    .update(aac)
    .set(updatePayload)
    .where(eq(aac.clientIdCode, clientIdCode));

  // Name / status / team all live in this payload and all render on the client
  // cards, so the cached /api/clients list is stale the moment this lands.
  invalidateClientsCache();

  // Sync to BigQuery
  let bqStatus: "success" | "error" = "success";
  let bqError: string | undefined;
  try {
    for (const f of bqFields) {
      await updateAacFieldInBigQuery(clientIdCode, f.field, f.value);
    }
  } catch (err) {
    bqStatus = "error";
    bqError = err instanceof Error ? err.message : String(err);
    console.error(`[AAC] BQ sync FAILED: ${clientIdCode}.${field}:`, err);
  }

  const durationMs = Date.now() - startMs;

  // Log to admin_event_log
  await db.insert(adminEventLog).values({
    userEmail: session.user?.email ?? null,
    userName: session.user?.name ?? null,
    section: "clients",
    action: "client:edit",
    status: bqStatus,
    resourceType: "client",
    resourceId: clientIdCode,
    resourceLabel: `${clientIdCode} → ${field}`,
    message: bqStatus === "success"
      ? `Updated ${field}: "${oldValue}" → "${value}" (DB + BQ)`
      : `Updated ${field}: "${oldValue}" → "${value}" (DB ok, BQ failed: ${bqError})`,
    detail: { field, oldValue, newValue: value, bqStatus, bqError },
    durationMs,
  }).catch(() => {}); // best-effort logging

  // 1o8: mirror the edit to the AAC Google Sheet (two-way sync, src/lib/aac-sync).
  queueAacSheetPush(clientIdCode);

  // Move the Drive folder to match the new status. Deferred with after(), not
  // fired-and-forgotten: it opens with a db.select() on drive_folders, and an
  // un-awaited query is abandoned mid-protocol when Vercel freezes the sandbox,
  // pinning a Supavisor pool slot. The Drive move that follows would also be
  // silently dropped. See src/lib/sales-cache.awaited.test.ts.
  // Prospect → Prospect folder, Inactive → Inactive folder, Active/other → root.
  if (field === "ClientStatus") {
    const target = resolveClientFolderParent(value, ACTIVE_CLIENTS_FOLDER_ID);
    after(async () => {
      await moveClientFolder(clientIdCode, target, value);
    });
  }

  // Auto-assign Gantt tasks when team roles change (fire-and-forget)
  const TEAM_ROLE_FIELDS = [
    "AccountManager_MF",
    "ExecutiveStrategist_MF",
    "ProjectManager_MF",
    "DesignManager_MF",
    "SEOManager_MF",
    "PPCManager_MF",
    "CatalogManager_MF",
  ];
  if (TEAM_ROLE_FIELDS.includes(field)) {
    // Deferred with after(), not fired-and-forgotten: this writes to Postgres, and
    // an un-awaited write is abandoned mid-protocol when Vercel freezes the sandbox,
    // pinning a Supavisor pool slot. See src/lib/sales-cache.awaited.test.ts.
    after(async () => {
      try {
        await autoAssignGanttTasks(clientIdCode, rawData);
      } catch (err) {
        console.error("[AutoAssign] Failed:", err);
      }
    });
  }

  return NextResponse.json({ success: true, bqSyncFailed: bqStatus === "error" });
}

/**
 * Move the client's root Drive folder to a target folder.
 * Best-effort: logs errors but never throws.
 */
async function moveClientFolder(clientIdCode: string, targetFolderId: string, label: string): Promise<void> {
  try {
    const [rootRow] = await db
      .select({ driveFolderId: driveFolders.driveFolderId })
      .from(driveFolders)
      .where(and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "client")))
      .limit(1);

    if (!rootRow) {
      console.warn(`[Drive:${label}] No client folder found for ${clientIdCode} — skipping`);
      return;
    }

    const file = await driveClient.getFile(rootRow.driveFolderId, "id,parents");
    const oldParentId = file.parents?.[0];
    if (!oldParentId) {
      console.warn(`[Drive:${label}] Folder ${rootRow.driveFolderId} has no parent — skipping`);
      return;
    }

    if (oldParentId === targetFolderId) {
      console.info(`[Drive:${label}] ${clientIdCode} already in target folder — skipping`);
      return;
    }

    await driveClient.moveFile(rootRow.driveFolderId, targetFolderId, oldParentId);
    console.info(`[Drive:${label}] Moved ${clientIdCode} (${rootRow.driveFolderId}) → ${targetFolderId}`);
  } catch (err) {
    console.error(`[Drive:${label}] Failed to move folder for ${clientIdCode}:`, err);
  }
}

/**
 * Auto-assign ALL Gantt tasks + onboarding steps based on team roles.
 * - FeedbackWhiz + Send Onboarding Email → Executive Strategist (1o8M)
 * - All other onboarding tasks → Account Manager (1o8M)
 * Assigns even if already assigned (overwrites with latest team).
 * Returns total number of onboarding steps assigned.
 */
async function autoAssignGanttTasks(
  clientIdCode: string,
  rawData: Record<string, string>
): Promise<number> {
  const amName = rawData["AccountManager_MF"]?.trim();
  const esName = rawData["ExecutiveStrategist_MF"]?.trim();

  if (!amName && !esName) return 0;

  // Resolve names to user IDs and emails
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users);

  const resolveEmail = (name: string) => allUsers.find((u) => u.name === name || u.email === name)?.email ?? null;
  const resolveId = (name: string) => allUsers.find((u) => u.name === name || u.email === name)?.id ?? null;

  const amEmail = amName ? resolveEmail(amName) : null;
  const esEmail = esName ? resolveEmail(esName) : null;
  const amId = amName ? resolveId(amName) : null;
  const esId = esName ? resolveId(esName) : null;

  // ── 1. Assign Gantt tasks ──
  const tasks = await db
    .select({ id: clientGanttTasks.id, taskName: clientGanttTasks.taskName })
    .from(clientGanttTasks)
    .where(
      and(
        eq(clientGanttTasks.clientIdCode, clientIdCode),
        eq(clientGanttTasks.section, "Onboarding")
      )
    );

  const esTaskNames = new Set(["FeedbackWhiz", "Send Onboarding Email"]);
  for (const task of tasks) {
    const email = esTaskNames.has(task.taskName) ? (esEmail ?? amEmail) : amEmail;
    if (email) {
      await db.update(clientGanttTasks).set({ assignedTo: email, updatedAt: new Date() }).where(eq(clientGanttTasks.id, task.id));
    }
  }

  // ── 2. Assign onboarding steps ──
  const esStepKeys = new Set(["send_onboarding_email", "feedbackwhiz"]);
  const skipStepKeys = new Set<string>(); // all steps get auto-assigned
  let stepsAssigned = 0;

  for (const stepDef of ONBOARDING_STEPS) {
    if (skipStepKeys.has(stepDef.key)) continue;
    const isEsStep = esStepKeys.has(stepDef.key);
    const userId = isEsStep ? (esId ?? amId) : amId;
    if (!userId) continue;

    await db
      .insert(clientOnboardingSteps)
      .values({ clientIdCode, stepKey: stepDef.key, status: "pending", assigneeId: userId })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: { assigneeId: userId, updatedAt: new Date() },
      });
    stepsAssigned++;
  }

  // ── 3. Push assignees to Asana tasks ──
  const [asanaStep] = await db
    .select({ metadata: clientOnboardingSteps.metadata })
    .from(clientOnboardingSteps)
    .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "setup_asana")))
    .limit(1);

  const projectGid = asanaStep?.metadata && typeof asanaStep.metadata === "object" && "projectGid" in asanaStep.metadata
    ? String(asanaStep.metadata.projectGid)
    : null;

  if (projectGid) {
    // Resolve asana emails (prefer asanaEmail column if present)
    const allUsersWithAsana = await db.select({ name: users.name, email: users.email, asanaEmail: users.asanaEmail }).from(users);
    // Resolve against the org that owns this client's project: 1o8 for
    // new clients, 1o8 for the legacy ones. The same person has a different
    // address in each and neither org recognises the other's.
    const probe = createAsanaOrgProbe();
    const amAsanaEmail = amName
      ? await resolveAssigneeForProject(amName, projectGid, allUsersWithAsana, probe)
      : null;
    const esAsanaEmail = esName
      ? await resolveAssigneeForProject(esName, projectGid, allUsersWithAsana, probe)
      : null;
    if (amName && !amAsanaEmail) {
      console.warn(`[AutoAssign] AM "${amName}" has no identity in the project's Asana org, skipping`);
    }
    if (esName && !esAsanaEmail) {
      console.warn(`[AutoAssign] ES "${esName}" has no identity in the project's Asana org, skipping`);
    }

    for (const stepDef of ONBOARDING_STEPS) {
      if (skipStepKeys.has(stepDef.key)) continue;
      const asanaTaskName = STEP_TO_ASANA_TASK[stepDef.key];
      if (!asanaTaskName) continue;
      const isEsStep = esStepKeys.has(stepDef.key);
      const email = isEsStep ? (esAsanaEmail ?? amAsanaEmail) : amAsanaEmail;
      if (!email) continue;

      const taskGid = await findAsanaTaskInProject(projectGid, asanaTaskName);
      if (taskGid) {
        await updateAsanaTaskAssignee(taskGid, email).catch((err) =>
          console.error(`[AutoAssign] Asana assignee failed for ${stepDef.key}:`, err)
        );
      }
    }
  }

  return stepsAssigned;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string })?.role;
  if (role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;
  const body = await req.json();
  const { clientName, clientStatus, clientType, offboardingDate } = body as {
    clientName?: string;
    clientStatus?: string;
    clientType?: "AIA" | "NTA" | null;
    offboardingDate?: string;
  };

  // Validate at least one field to update
  if (
    clientName === undefined &&
    clientStatus === undefined &&
    clientType === undefined &&
    offboardingDate === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (clientType !== undefined && clientType !== null && clientType !== "AIA" && clientType !== "NTA") {
    return NextResponse.json({ error: "clientType must be AIA, NTA, or null" }, { status: 400 });
  }

  // Fetch current row
  const [client] = await db
    .select()
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Parse existing rawData so we can keep the JSONB mirror in sync — this is the
  // fix for the column-only writes that caused the ClientStatus desync.
  let rawData: Record<string, string> = {};
  if (typeof client.rawData === "string") {
    try {
      rawData = JSON.parse(client.rawData);
    } catch {
      /* ignore */
    }
  } else if (client.rawData) {
    rawData = client.rawData as Record<string, string>;
  }

  if (clientStatus !== undefined || offboardingDate !== undefined) {
    const gateError = inactiveRequiresOffboardingDate({
      nextStatus: clientStatus,
      nextOffboardingDate: offboardingDate,
      existingStatus: client.clientStatus,
      existingOffboardingDate: client.offboardingDate ?? rawData["OffboardingDate"],
    });
    if (gateError) {
      return NextResponse.json({ error: gateError }, { status: 400 });
    }
  }

  // ClientName/ClientStatus are mirrored into rawData + BigQuery via the shared
  // helper; clientType is a typed-only column (no JSONB mirror), set directly.
  const edits: Array<{ rawKey: string; value: string }> = [];
  if (clientName !== undefined) edits.push({ rawKey: "ClientName", value: clientName });
  if (clientStatus !== undefined) edits.push({ rawKey: "ClientStatus", value: clientStatus });
  if (offboardingDate !== undefined) edits.push({ rawKey: "OffboardingDate", value: offboardingDate });

  const { rawData: mergedRaw, columns, bqFields } = buildAacFieldSync(rawData, edits);

  const updatePayload: AacColumnPayload & {
    updatedAt: Date;
    rawData: Record<string, string>;
    clientType?: "AIA" | "NTA" | null;
  } = {
    ...columns,
    rawData: mergedRaw,
    updatedAt: new Date(),
  };
  if (clientType !== undefined) updatePayload.clientType = clientType;

  await db
    .update(aac)
    .set(updatePayload)
    .where(eq(aac.clientIdCode, clientIdCode));

  // Name / status / team all live in this payload and all render on the client
  // cards, so the cached /api/clients list is stale the moment this lands.
  invalidateClientsCache();

  // Sync the mirrored fields to BigQuery (best-effort, matches the PUT path).
  let bqError: string | undefined;
  try {
    for (const f of bqFields) {
      await updateAacFieldInBigQuery(clientIdCode, f.field, f.value);
    }
  } catch (err) {
    bqError = err instanceof Error ? err.message : String(err);
    console.error(`[AAC] BQ sync FAILED (PATCH): ${clientIdCode}:`, err);
  }

  // Move the Drive folder to match the new status. Deferred with after() for the
  // same reason as the PUT path above — see that comment and
  // src/lib/sales-cache.awaited.test.ts.
  // Prospect → Prospect folder, Inactive → Inactive folder, Active/other → root.
  if (clientStatus !== undefined && clientStatus !== client.clientStatus) {
    const target = resolveClientFolderParent(clientStatus, ACTIVE_CLIENTS_FOLDER_ID);
    after(async () => {
      await moveClientFolder(clientIdCode, target, clientStatus);
    });
  }

  // Log the edit
  await db.insert(adminEventLog).values({
    userEmail: session.user?.email ?? null,
    userName: session.user?.name ?? null,
    section: "clients",
    action: "client:edit",
    status: bqError ? "error" : "success",
    resourceType: "client",
    resourceId: clientIdCode,
    resourceLabel: clientIdCode,
    message: bqError
      ? `Updated client: name="${clientName ?? client.clientName}", status="${clientStatus ?? client.clientStatus}" (DB ok, BQ failed: ${bqError})`
      : `Updated client: name="${clientName ?? client.clientName}", status="${clientStatus ?? client.clientStatus}" (DB + BQ)`,
    detail: { clientName, clientStatus, clientType, previousName: client.clientName, previousStatus: client.clientStatus, bqError },
  }).catch(() => {});

  // 1o8: mirror name/status to the AAC Google Sheet.
  queueAacSheetPush(clientIdCode);

  return NextResponse.json({
    success: true,
    clientIdCode,
    clientName: clientName ?? client.clientName,
    clientStatus: clientStatus ?? client.clientStatus,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string })?.role;
  if (!hasAdminPowers(role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { clientIdCode } = await params;

  // Verify client exists
  const [client] = await db
    .select({ id: aac.id, clientName: aac.clientName })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Delete related records in dependency order
  await db.delete(clientGanttTasks).where(eq(clientGanttTasks.clientIdCode, clientIdCode));
  await db.delete(clientOnboardingSteps).where(eq(clientOnboardingSteps.clientIdCode, clientIdCode));
  await db.delete(clientForecasts).where(eq(clientForecasts.clientIdCode, clientIdCode));
  await db.delete(spApiCredentials).where(eq(spApiCredentials.clientIdCode, clientIdCode));
  await db.execute(sql`DELETE FROM inventory_rec_settings WHERE client_id_code = ${clientIdCode}`);
  // Delete products
  await db.delete(master).where(eq(master.clientIdCode, clientIdCode));
  // Delete AAC record
  await db.delete(aac).where(eq(aac.clientIdCode, clientIdCode));

  invalidateClientsCache();

  // Log the deletion
  await db.insert(adminEventLog).values({
    userEmail: session.user?.email ?? null,
    userName: session.user?.name ?? null,
    section: "clients",
    action: "client:delete",
    status: "success",
    resourceType: "client",
    resourceId: clientIdCode,
    resourceLabel: client.clientName ?? clientIdCode,
    message: `Permanently deleted client "${client.clientName}" (${clientIdCode})`,
    detail: { clientIdCode, clientName: client.clientName },
  }).catch(() => {});

  return NextResponse.json({ success: true, deleted: clientIdCode });
}
