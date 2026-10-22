/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/async-await-in-loop */
// ═══════════════════════════════════════════════════════════════
// POST /api/projects/[id]/export-gdoc
// Uses direct Google Drive REST API with manual JWT auth
// — no googleapis dependency, no webpack crypto issues
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";
import { buildDocxBuffer } from "@/lib/docx-builder";
import crypto from "crypto";

export const maxDuration = 60;

// ── Private key parsing (tries every format) ─────────────────

function parsePrivateKey(raw: string): crypto.KeyObject {
  // Step 1: replace escaped newlines
  const cleaned = raw.replace(/\\n/g, "\n");

  // Try as-is first (already valid PEM)
  try { return crypto.createPrivateKey(cleaned); } catch (_) {}

  // Extract raw base64 content
  const b64 = cleaned
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");

  const wrap = (h: string) => {
    const lines = b64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${h}-----\n${lines.join("\n")}\n-----END ${h}-----\n`;
  };

  // Try PKCS#8 PEM
  try { return crypto.createPrivateKey(wrap("PRIVATE KEY")); } catch (_) {}
  // Try PKCS#1 PEM
  try { return crypto.createPrivateKey(wrap("RSA PRIVATE KEY")); } catch (_) {}
  // Try DER PKCS#8
  try { return crypto.createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" }); } catch (_) {}
  // Try DER PKCS#1
  try { return crypto.createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs1" }); } catch (_) {}

  // All failed — include diagnostics
  throw new Error(
    `Cannot parse private key. len=${raw.length}, ` +
    `starts="${raw.substring(0, 40)}", ` +
    `hasLiteralBackslashN=${raw.includes("\\n")}, ` +
    `hasRealNewline=${raw.includes("\n")}, ` +
    `b64len=${b64.length}`
  );
}

// ── Google OAuth2 via manual JWT ─────────────────────────────

function createJWT(email: string, privateKey: crypto.KeyObject, scopes: string[], subject?: string) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  if (subject) claims.sub = subject;
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  const signature = signer.sign(privateKey, "base64url");
  return `${input}.${signature}`;
}

async function getAccessToken(email: string, privateKey: crypto.KeyObject, scopes: string[], subject?: string) {
  const jwt = createJWT(email, privateKey, scopes, subject);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

// ── Google Drive REST helpers ────────────────────────────────

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

async function driveList(token: string, q: string, driveId?: string) {
  const p = new URLSearchParams({ q, fields: "files(id)", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  if (driveId) { p.set("corpora", "drive"); p.set("driveId", driveId); }
  const res = await fetch(`${DRIVE}/files?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return (data.files || []) as { id: string }[];
}

async function driveCreateFolder(token: string, name: string, parentId: string) {
  const res = await fetch(`${DRIVE}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const data = await res.json();
  return data.id as string;
}

async function driveDelete(token: string, fileId: string) {
  await fetch(`${DRIVE}/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function driveUpload(token: string, name: string, parentId: string, buffer: Buffer, mimeType: string) {
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const boundary = "----docxupload" + Date.now();
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  return data.id as string;
}

async function driveGetMeta(token: string, fileId: string, fields: string) {
  const res = await fetch(`${DRIVE}/files/${fileId}?supportsAllDrives=true&fields=${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// ── Route handler ────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // ── Env check ──────────────────────────────────────────────
    const rootFolderId     = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    const serviceEmail     = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const serviceKey       = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
    const impersonateEmail = process.env.GOOGLE_IMPERSONATE_EMAIL?.trim();
    if (!rootFolderId || !serviceEmail || !serviceKey) {
      const missing = [
        !serviceEmail && "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        !serviceKey   && "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
        !rootFolderId && "GOOGLE_DRIVE_FOLDER_ID",
      ].filter(Boolean).join(", ");
      return NextResponse.json(
        { error: `Google Drive not configured. Add to .env.local: ${missing}`, setup: true },
        { status: 400 }
      );
    }

    // ── Load data ──────────────────────────────────────────────
    const supabase = createServerClient();
    const [{ data: proj }, { data: dbRows }] = await Promise.all([
      supabase.from("projects").select("brand_name").eq("id", params.id).single(),
      supabase.from("s7_seo").select("*").eq("project_id", params.id).order("created_at", { ascending: true }),
    ]);
    if (!dbRows?.length) {
      return NextResponse.json({ error: "No SEO data found. Save content first." }, { status: 400 });
    }

    const brand    = (proj as any)?.brand_name || "Unknown Brand";
    const today    = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const dateSlug = new Date().toISOString().slice(0, 10);

    // ── Map rows ───────────────────────────────────────────────
    const rows = (dbRows as any[]).map(r => ({
      asin: r.asin||"", parentage: r.parentage_level||"", product: r.variation_product||"",
      flavor: r.flavor||"", style: r.style||"", color: r.color||"", size: r.size||"",
      title: r.title||"", titleC: r.title_char_length||0,
      d1:r.detailed_bullet_point_1||"",  d1c:r.detailed_bullet_point_1_char_length||0,
      d2:r.detailed_bullet_point_2||"",  d2c:r.detailed_bullet_point_2_char_length||0,
      d3:r.detailed_bullet_point_3||"",  d3c:r.detailed_bullet_point_3_char_length||0,
      d4:r.detailed_bullet_point_4||"",  d4c:r.detailed_bullet_point_4_char_length||0,
      d5:r.detailed_bullet_point_5||"",  d5c:r.detailed_bullet_point_5_char_length||0,
      c1:r.concise_bullet_point_1||"",   c1c:r.concise_bullet_point_1_char_length||0,
      c2:r.concise_bullet_point_2||"",   c2c:r.concise_bullet_point_2_char_length||0,
      c3:r.concise_bullet_point_3||"",   c3c:r.concise_bullet_point_3_char_length||0,
      c4:r.concise_bullet_point_4||"",   c4c:r.concise_bullet_point_4_char_length||0,
      c5:r.concise_bullet_point_5||"",   c5c:r.concise_bullet_point_5_char_length||0,
      ct1:r.content_bullet_point_1||"",  ct1c:r.content_bullet_point_1_char_length||0,
      ct2:r.content_bullet_point_2||"",  ct2c:r.content_bullet_point_2_char_length||0,
      ct3:r.content_bullet_point_3||"",  ct3c:r.content_bullet_point_3_char_length||0,
      ct4:r.content_bullet_point_4||"",  ct4c:r.content_bullet_point_4_char_length||0,
      ct5:r.content_bullet_point_5||"",  ct5c:r.content_bullet_point_5_char_length||0,
      kf1:r.key_features_bullet_point_1||"", kf1c:r.key_features_bullet_point_1_char_length||0,
      kf2:r.key_features_bullet_point_2||"", kf2c:r.key_features_bullet_point_2_char_length||0,
      kf3:r.key_features_bullet_point_3||"", kf3c:r.key_features_bullet_point_3_char_length||0,
      kf4:r.key_features_bullet_point_4||"", kf4c:r.key_features_bullet_point_4_char_length||0,
      kf5:r.key_features_bullet_point_5||"", kf5c:r.key_features_bullet_point_5_char_length||0,
      desc:r.product_description||"",        descC:r.product_description_char_length||0,
      bkCore:r.search_terms_core||"",        bkCoreB:r.search_terms_core_byte_length||0,
      bkSupp:r.search_terms_supplement||"",  bkSuppB:r.search_terms_supplement_byte_length||0,
      bkSymp:r.search_terms_symptom||"",     bkSympB:r.search_terms_symptom_byte_length||0,
      bkAud:r.search_terms_audience||"",     bkAudB:r.search_terms_audience_byte_length||0,
      bkLong:r.search_terms_longtail||"",    bkLongB:r.search_terms_longtail_byte_length||0,
    }));
    rows.sort((a, b) => {
      const aP = a.parentage.toLowerCase()==="parent", bP = b.parentage.toLowerCase()==="parent";
      if (aP && !bP) return -1; if (!aP && bP) return 1; return a.asin.localeCompare(b.asin);
    });

    // ── Build docx ───────────────────────────────────────────
    const buffer = await buildDocxBuffer(rows, brand, today);
    const docName = `OUT_SEO_${brand.replace(/\s+/g, "_")}_${dateSlug}`;

    // ── Authenticate ─────────────────────────────────────────
    const privateKey = parsePrivateKey(serviceKey);
    const scopes = ["https://www.googleapis.com/auth/drive"];
    let token: string;
    try {
      token = await getAccessToken(serviceEmail, privateKey, scopes, impersonateEmail || undefined);
    } catch (authErr: any) {
      // Provide diagnostics for auth failures
      const diag = `ServiceAccount: ${serviceEmail}, Impersonate: ${impersonateEmail || "none"}, Folder: ${rootFolderId}`;
      console.error("Auth diagnostic:", diag, authErr);
      return NextResponse.json({
        error: `Google auth failed. Verify your Vercel env vars match your GCP service account JSON. (${diag})`,
        detail: authErr.message,
      }, { status: 500 });
    }

    // ── Detect Shared Drive ──────────────────────────────────
    let driveId: string | undefined;
    try {
      const meta = await driveGetMeta(token, rootFolderId, "driveId");
      driveId = meta.driveId || undefined;
    } catch (_) { /* rootFolderId might be a Drive ID itself */ }

    // ── Find or create brand subfolder ───────────────────────
    const safeBrand = brand.replace(/[/\\?%*:|"<>]/g, "-").trim();
    const existing = await driveList(
      token,
      `name='${safeBrand.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
      driveId,
    );

    const brandFolderId = existing.length
      ? existing[0].id
      : await driveCreateFolder(token, safeBrand, rootFolderId);

    // ── Delete old file with same name ───────────────────────
    try {
      const old = await driveList(
        token,
        `(name='${docName}' or name='${docName}.docx') and '${brandFolderId}' in parents and trashed=false`,
        driveId,
      );
      for (const f of old) await driveDelete(token, f.id);
    } catch (_) { /* ignore cleanup errors */ }

    // ── Upload .docx ─────────────────────────────────────────
    const fileId = await driveUpload(
      token,
      `${docName}.docx`,
      brandFolderId,
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const url = `https://drive.google.com/file/d/${fileId}/view`;
    return NextResponse.json({ url, brand, filename: docName });

  } catch (err: any) {
    console.error("export-gdoc error:", err);
    return NextResponse.json({ error: err.message || "Export failed" }, { status: 500 });
  }
}
