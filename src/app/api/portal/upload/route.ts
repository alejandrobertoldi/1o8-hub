import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { resolveUploadFolder, buildFileName } from "@/lib/drive-upload";
import { driveClient } from "@/lib/drive-client";
import { logEvent } from "@/lib/event-logger";
import { hasAdminPowers } from "@/lib/roles";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = session.user.role;
  if (role !== "client" && !hasAdminPowers(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientIdCode = session.user.clientIdCode;
  if (role === "client" && !clientIdCode) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const asin = formData.get("asin") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Use client's own code, or admin can specify via form data
    const uploadClientCode = hasAdminPowers(role)
      ? (formData.get("clientIdCode") as string) ?? clientIdCode
      : clientIdCode;

    if (!uploadClientCode) {
      return NextResponse.json({ error: "Missing client code" }, { status: 400 });
    }

    // Resolve the upload folder in Google Drive
    const folder = await resolveUploadFolder({
      clientIdCode: uploadClientCode,
      folderType: "aplus",
      asin,
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Client folder not configured in Google Drive" },
        { status: 404 }
      );
    }

    // Build deterministic file name
    const fileName = buildFileName({
      clientIdCode: uploadClientCode,
      asin,
      folderType: "portal-upload",
      mimeType: file.type,
    });

    // Upload to Drive
    const buffer = Buffer.from(await file.arrayBuffer());
    const driveFile = await driveClient.uploadFile(
      fileName,
      folder.driveFolderId,
      buffer,
      file.type
    );

    logEvent({
      userEmail: session.user.email,
      userName: session.user.name ?? undefined,
      section: "portal",
      action: "file:upload",
      resourceType: "file",
      resourceId: driveFile.id,
      resourceLabel: file.name,
      message: `Uploaded ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
    });

    return NextResponse.json({
      fileId: driveFile.id,
      fileName: driveFile.name,
      driveUrl: `https://drive.google.com/file/d/${driveFile.id}/view`,
    });
  } catch (error) {
    console.error("[portal-upload] Failed:", error instanceof Error ? error.message : error);

    logEvent({
      userEmail: session.user.email,
      section: "portal",
      action: "file:upload",
      status: "error",
      message: `Upload failed: ${error instanceof Error ? error.message : "unknown error"}`,
    });

    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
