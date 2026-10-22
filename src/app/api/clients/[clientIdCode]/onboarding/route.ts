/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientOnboardingSteps, driveFolders, master, users } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ONBOARDING_STEPS, PARENT_GROUP_LABELS, isMultiStepParent, getStepsForParent } from "@/lib/onboarding/steps";
import { withDbTimeout, DbTimeoutError } from "@/lib/db/with-timeout";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clientIdCode: string }> }
) {
  try {
    return await withDbTimeout(getOnboarding(req, context));
  } catch (err) {
    if (err instanceof DbTimeoutError) {
      console.error("[api/clients/onboarding] GET timed out:", err.message);
      return NextResponse.json({ error: "Request timed out, please retry" }, { status: 503 });
    }
    throw err;
  }
}

async function getOnboarding(
  _req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Normalize the code: legacy/exported client codes can carry stray whitespace,
  // which would otherwise silently miss the step rows keyed under the clean code.
  const { clientIdCode: rawClientIdCode } = await params;
  const clientIdCode = rawClientIdCode.trim();

  // Get all recorded steps for this client
  const rows = await db
    .select()
    .from(clientOnboardingSteps)
    .where(eq(clientOnboardingSteps.clientIdCode, clientIdCode));

  const stepMap = new Map(rows.map((r) => [r.stepKey, r]));

  // Auto-mark "create_client" as completed — if we're fetching onboarding, the client exists
  if (!stepMap.has("create_client")) {
    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey: "create_client",
        status: "completed",
        completedAt: new Date(),
        completedBy: "auto",
      })
      .onConflictDoNothing();
    stepMap.set("create_client", {
      id: "",
      clientIdCode,
      stepKey: "create_client",
      status: "completed",
      completedAt: new Date(),
      completedBy: "auto",
      metadata: null,
      assigneeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Fetch aac data for pre-populating step metadata
  const [client] = await db
    .select({ rawData: aac.rawData, onboardingDate: aac.onboardingDate, clientType: aac.clientType })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  const intentwiseId = client?.rawData?.IntentwiseID?.trim() || null;
  const intentwiseAmcId = client?.rawData?.IntentwiseIDAMC?.trim() || null;
  const intentwiseName = client?.rawData?.IntentwiseName?.trim() || null;
  const intentwiseAmcName = client?.rawData?.IntentwiseNameAMC?.trim() || null;
  const merchantId = client?.rawData?.merchantID?.trim() || null;
  const startDate = client?.onboardingDate ? client.onboardingDate.toISOString().slice(0, 10) : null;
  const marketplace = client?.rawData?.Marketplace?.trim() || "";
  const marketplaceType = marketplace.replace(/^Amazon\s*/i, "").toUpperCase();
  const clientType = client?.clientType ?? null;

  // Build contacts array from AAC ClientContactName1-5 / ClientContactEmail1-5
  const existingContacts: { name: string; email: string }[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = client?.rawData?.[`ClientContactName${i}`]?.trim() || "";
    const email = client?.rawData?.[`ClientContactEmail${i}`]?.trim() || "";
    if (email) existingContacts.push({ name, email });
  }

  // Resolve the root Drive folder URL so the drive_folders step can link out
  const [rootDriveFolder] = await db
    .select({ driveFolderId: driveFolders.driveFolderId })
    .from(driveFolders)
    .where(and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "client")))
    .limit(1);
  const driveFolderUrl = rootDriveFolder?.driveFolderId
    ? `https://drive.google.com/drive/folders/${rootDriveFolder.driveFolderId}`
    : null;

  // master.count > 0 means CLR (and, for AIA, ALR) has been merged into master.
  // Used to auto-complete amazon_import_attributes (CLR) and amazon_import_catalog (ALR, AIA only).
  const [masterSummary] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));
  const masterCount = masterSummary?.count ?? 0;

  // Map of step keys to their aac-sourced values
  // For intentwise steps we inject ID (drives auto-complete) plus the name as a sidecar field.
  const idStepMap: Record<
    string,
    { field: string; value: string | null; extra?: Record<string, string | null> }
  > = {
    intentwise_id_provided: {
      field: "intentwiseId",
      value: intentwiseId,
      extra: { intentwiseName },
    },
    intentwise_amc_id_provided: {
      field: "intentwiseId",
      value: intentwiseAmcId,
      extra: { intentwiseName: intentwiseAmcName },
    },
    iw_get_merchant_id: { field: "merchantId", value: merchantId },
    setup_timeline: { field: "startDate", value: startDate },
  };

  // Filter steps by marketplace and client type
  const applicableSteps = ONBOARDING_STEPS.filter((def) => {
    if (def.marketplaceFilter && !marketplaceType.includes(def.marketplaceFilter)) {
      return false;
    }
    if (def.clientTypeFilter && def.clientTypeFilter !== clientType) {
      return false;
    }
    return true;
  });

  // Fetch assignee users for steps that have an assignee_id.
  // Guard against non-UUID assignee ids (possible from a data export/migration):
  // passing one to inArray(users.id, ...) would fail the uuid cast and 500 the
  // whole request, making the client look empty ("0/0") on the summary page.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const assigneeIds = rows
    .map((r) => r.assigneeId)
    .filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
  const assigneeUsers = assigneeIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role })
        .from(users)
        .where(inArray(users.id, assigneeIds))
    : [];
  const assigneeMap = new Map(assigneeUsers.map((u) => [u.id, u]));

  // Merge definitions with DB state
  const steps = applicableSteps.map((def) => {
    const row = stepMap.get(def.key);
    let metadata = row?.metadata ?? null;

    // Inject aac-sourced values (intentwise IDs, start date)
    const idInfo = idStepMap[def.key];
    if (idInfo) {
      metadata = { ...metadata, [idInfo.field]: idInfo.value, ...(idInfo.extra ?? {}) };
      // Auto-mark as completed if value exists in aac
      if (idInfo.value && (!row || row.status === "pending")) {
        const assignee = row?.assigneeId ? assigneeMap.get(row.assigneeId) ?? null : null;
        return {
          key: def.key,
          label: def.label,
          description: def.description,
          order: def.order,
          parent: def.parent ?? null,
          status: "completed" as const,
          completedAt: null,
          completedBy: "auto",
          metadata,
          assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, image: assignee.image, role: assignee.role } : null,
        };
      }
    }

    // Inject Drive root folder URL for the drive_folders step (works for legacy completions too)
    if (def.key === "drive_folders" && driveFolderUrl) {
      metadata = { ...metadata, driveFolderUrl };
    }

    // Auto-complete CLR/ALR import steps when master has been populated for this client.
    // For AIA: master rows only appear once both CLR and ALR are merged → both steps complete together.
    // For NTA: only CLR feeds master, and amazon_import_catalog is filtered out earlier.
    if (
      (def.key === "amazon_import_attributes" || def.key === "amazon_import_catalog") &&
      masterCount > 0
    ) {
      metadata = { ...metadata, productCount: masterCount };
      if (!row || row.status === "pending") {
        const assignee = row?.assigneeId ? assigneeMap.get(row.assigneeId) ?? null : null;
        return {
          key: def.key,
          label: def.label,
          description: def.description,
          order: def.order,
          parent: def.parent ?? null,
          status: "completed" as const,
          completedAt: null,
          completedBy: "auto",
          metadata,
          assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, image: assignee.image, role: assignee.role } : null,
        };
      }
    }

    // Inject contacts from AAC for the add_contact_emails step
    if (def.key === "add_contact_emails") {
      metadata = { ...metadata, contacts: existingContacts };
      if (existingContacts.length > 0 && (!row || row.status === "pending")) {
        const assignee = row?.assigneeId ? assigneeMap.get(row.assigneeId) ?? null : null;
        return {
          key: def.key,
          label: def.label,
          description: def.description,
          order: def.order,
          parent: def.parent ?? null,
          status: "completed" as const,
          completedAt: null,
          completedBy: "auto",
          metadata,
          assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email, image: assignee.image, role: assignee.role } : null,
        };
      }
    }

    const assignee = row?.assigneeId ? assigneeMap.get(row.assigneeId) ?? null : null;

    return {
      key: def.key,
      label: def.label,
      description: def.description,
      order: def.order,
      parent: def.parent ?? null,
      status: row?.status ?? "pending",
      completedAt: row?.completedAt ?? null,
      completedBy: row?.completedBy ?? null,
      metadata,
      assignee: assignee ? {
        id: assignee.id,
        name: assignee.name,
        email: assignee.email,
        image: assignee.image,
        role: assignee.role,
      } : null,
    };
  });

  // Compute parent group statuses
  const parentGroups = new Map<string, {
    label: string;
    order: number;
    isMultiStep: boolean;
    status: "pending" | "in_progress" | "completed";
  }>();

  for (const [parentKey, meta] of Object.entries(PARENT_GROUP_LABELS)) {
    const multiStep = isMultiStepParent(parentKey);
    const children = steps.filter((s) => s.parent === parentKey);

    let status: "pending" | "in_progress" | "completed" = "pending";
    if (children.length > 0) {
      const allCompleted = children.every((s) => s.status === "completed");
      const anyStarted = children.some((s) => s.status === "completed" || s.status === "in_progress");
      if (allCompleted) status = "completed";
      else if (anyStarted) status = "in_progress";
    }

    parentGroups.set(parentKey, {
      label: meta.label,
      order: meta.order,
      isMultiStep: multiStep,
      status,
    });
  }

  const groups = Object.fromEntries(parentGroups);

  return NextResponse.json({ clientIdCode, steps, groups });
}
