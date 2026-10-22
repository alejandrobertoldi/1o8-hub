import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientOnboardingSteps, driveFolders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createClientDriveFolders } from "@/lib/onboarding/create-drive-folders";
import { resolveClientFolderParent } from "@/lib/onboarding/client-folder-routing";
import { syncGanttOnStepComplete } from "@/lib/onboarding/sync-gantt";
import { getErrorMessage } from "@/lib/api-utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientIdCode: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role) && session.user.role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientIdCode } = await params;

  // Manual complete toggle (for already-onboarded clients)
  const body = await req.json().catch(() => ({}));
  if (body.manualComplete) {
    const [existing] = await db
      .select({ status: clientOnboardingSteps.status })
      .from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "drive_folders")))
      .limit(1);
    if (existing?.status === "completed") {
      await db.update(clientOnboardingSteps)
        .set({ status: "pending", completedAt: null, completedBy: null, updatedAt: new Date() })
        .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "drive_folders")));
      return NextResponse.json({ success: true, status: "pending" });
    }
    await db.insert(clientOnboardingSteps)
      .values({ clientIdCode, stepKey: "drive_folders", status: "completed", completedAt: new Date(), completedBy: session.user.email ?? session.user.name ?? "unknown", metadata: { manualComplete: true } })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: { status: "completed", completedAt: new Date(), completedBy: session.user.email ?? session.user.name ?? "unknown", updatedAt: new Date() },
      });
    await syncGanttOnStepComplete(clientIdCode, "drive_folders");
    return NextResponse.json({ success: true, status: "completed" });
  }

  const sharedDriveId = process.env.GOOGLE_SHARED_DRIVE_ID?.trim();
  if (!sharedDriveId) {
    return NextResponse.json(
      { error: "GOOGLE_SHARED_DRIVE_ID not configured" },
      { status: 500 }
    );
  }

  // Look up client name + status: name drives folder naming, status drives placement
  const [client] = await db
    .select({ clientName: aac.clientName, clientStatus: aac.clientStatus })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);
  const clientName = client?.clientName ?? undefined;
  const rootParent = resolveClientFolderParent(client?.clientStatus, sharedDriveId);

  // Mark step as in_progress
  await db
    .insert(clientOnboardingSteps)
    .values({
      clientIdCode,
      stepKey: "drive_folders",
      status: "in_progress",
    })
    .onConflictDoUpdate({
      target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
      set: { status: "in_progress", updatedAt: new Date() },
    });

  try {
    const result = await createClientDriveFolders(clientIdCode, rootParent, clientName);

    // Resolve root client folder URL for the completed-step link
    const [rootFolder] = await db
      .select({ driveFolderId: driveFolders.driveFolderId })
      .from(driveFolders)
      .where(and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "client")))
      .limit(1);
    const driveFolderUrl = rootFolder?.driveFolderId
      ? `https://drive.google.com/drive/folders/${rootFolder.driveFolderId}`
      : null;

    // Mark completed
    await db
      .update(clientOnboardingSteps)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: {
          foldersCreated: result.created.length,
          foldersSkipped: result.skipped,
          driveFolderUrl,
          folders: result.created.map((f) => ({
            name: f.name,
            type: f.type,
            path: f.path,
          })),
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientOnboardingSteps.clientIdCode, clientIdCode),
          eq(clientOnboardingSteps.stepKey, "drive_folders")
        )
      );

    await syncGanttOnStepComplete(clientIdCode, "drive_folders");
    return NextResponse.json({
      success: true,
      created: result.created.length,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error(`Drive folder creation failed for ${clientIdCode}:`, message);

    // Mark failed
    await db
      .update(clientOnboardingSteps)
      .set({
        status: "failed",
        metadata: { error: message },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientOnboardingSteps.clientIdCode, clientIdCode),
          eq(clientOnboardingSteps.stepKey, "drive_folders")
        )
      );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
