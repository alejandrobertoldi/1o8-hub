import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientOnboardingSteps, driveFolders, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { sendEmail, buildOnboardingEmail } from "@/lib/email";
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

  // Allow body to override recipient email (e.g. for manual entry)
  const body = await req.json().catch(() => ({}));

  // Manual complete toggle (for already-onboarded clients)
  if (body.manualComplete) {
    const [existing] = await db
      .select({ status: clientOnboardingSteps.status })
      .from(clientOnboardingSteps)
      .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "send_onboarding_email")))
      .limit(1);
    if (existing?.status === "completed") {
      await db.update(clientOnboardingSteps)
        .set({ status: "pending", completedAt: null, completedBy: null, updatedAt: new Date() })
        .where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "send_onboarding_email")));
      return NextResponse.json({ success: true, status: "pending" });
    }
    await db.insert(clientOnboardingSteps)
      .values({ clientIdCode, stepKey: "send_onboarding_email", status: "completed", completedAt: new Date(), completedBy: session.user.email ?? session.user.name ?? "unknown", metadata: { manualComplete: true } })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: { status: "completed", completedAt: new Date(), completedBy: session.user.email ?? session.user.name ?? "unknown", updatedAt: new Date() },
      });
    await syncGanttOnStepComplete(clientIdCode, "send_onboarding_email");
    return NextResponse.json({ success: true, status: "completed" });
  }

  // Accept emails[] (new) or legacy email string
  let recipientEmails: string[] = [];
  if (Array.isArray(body.emails)) {
    recipientEmails = (body.emails as unknown[]).filter((e): e is string => typeof e === "string" && e.trim().length > 0).map((e) => e.trim());
  } else if (typeof body.email === "string" && body.email.trim()) {
    recipientEmails = [body.email.trim()];
  }

  // Look up client name + drive folder + asana URL in parallel
  const [clientRow, driveFolderRow, asanaStep] = await Promise.all([
    db.select({ clientName: aac.clientName, rawData: aac.rawData }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1).then((r) => r[0]),
    db.select({ driveFolderId: driveFolders.driveFolderId }).from(driveFolders).where(and(eq(driveFolders.clientIdCode, clientIdCode), eq(driveFolders.folderType, "client"))).limit(1).then((r) => r[0]),
    db.select({ metadata: clientOnboardingSteps.metadata }).from(clientOnboardingSteps).where(and(eq(clientOnboardingSteps.clientIdCode, clientIdCode), eq(clientOnboardingSteps.stepKey, "setup_asana"))).limit(1).then((r) => r[0]),
  ]);

  const clientName = clientRow?.clientName || clientIdCode;
  const driveFolderUrl = driveFolderRow?.driveFolderId
    ? `https://drive.google.com/drive/folders/${driveFolderRow.driveFolderId}`
    : undefined;
  const asanaUrl =
    asanaStep?.metadata && typeof asanaStep.metadata === "object" && "projectUrl" in asanaStep.metadata
      ? String(asanaStep.metadata.projectUrl)
      : undefined;

  // If no emails provided, fall back to AAC contact email or client-role user
  if (recipientEmails.length === 0) {
    const contactEmail = clientRow?.rawData?.ClientContactEmail1?.trim();
    if (contactEmail) {
      recipientEmails = [contactEmail];
    } else {
      const [clientUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.clientIdCode, clientIdCode), eq(users.role, "client")))
        .limit(1);
      if (clientUser?.email) recipientEmails = [clientUser.email];
    }
  }

  if (recipientEmails.length === 0) {
    return NextResponse.json(
      { error: "No client email found. Provide an email address." },
      { status: 400 }
    );
  }

  // Build email with injected links
  const { subject, html } = buildOnboardingEmail(clientName, {
    portalUrl: "https://www.marketfoundryhub.com/portal",
    driveFolderUrl,
    asanaUrl,
  });

  try {
    const results = await Promise.all(
      recipientEmails.map((to) => sendEmail({ to, subject, html }))
    );
    const sent = results.every(Boolean);
    const sentTo = recipientEmails.join(", ");

    if (!sent) {
      // Mark as failed
      await db
        .insert(clientOnboardingSteps)
        .values({
          clientIdCode,
          stepKey: "send_onboarding_email",
          status: "failed",
          metadata: { error: "Email send failed — check RESEND_API_KEY" },
        })
        .onConflictDoUpdate({
          target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
          set: {
            status: "failed",
            metadata: { error: "Email send failed — check RESEND_API_KEY" },
            updatedAt: new Date(),
          },
        });

      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    // Mark step completed
    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey: "send_onboarding_email",
        status: "completed",
        completedAt: new Date(),
        completedBy: session.user.email ?? session.user.name ?? "unknown",
        metadata: { sentTo },
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: session.user.email ?? session.user.name ?? "unknown",
          metadata: { sentTo },
          updatedAt: new Date(),
        },
      });

    await syncGanttOnStepComplete(clientIdCode, "send_onboarding_email");

    return NextResponse.json({
      success: true,
      status: "completed",
      sentTo,
    });
  } catch (err) {
    const message = getErrorMessage(err);

    await db
      .insert(clientOnboardingSteps)
      .values({
        clientIdCode,
        stepKey: "send_onboarding_email",
        status: "failed",
        metadata: { error: message },
      })
      .onConflictDoUpdate({
        target: [clientOnboardingSteps.clientIdCode, clientOnboardingSteps.stepKey],
        set: {
          status: "failed",
          metadata: { error: message },
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
