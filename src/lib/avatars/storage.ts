import { createHash } from "node:crypto";
import { STORED_AVATAR_PATH_MARKER } from "./url";

export const AVATAR_BUCKET = "avatars";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function avatarExtension(contentType: string): string {
  const ext = EXT_BY_TYPE[contentType.toLowerCase()];
  if (!ext) throw new Error(`Unsupported avatar content type: ${contentType}`);
  return ext;
}

/**
 * Upsert the avatar at avatars/{userId}.{ext} and return its public URL.
 * Server-only: uses the service_role key. The ?v= content hash busts the CDN
 * cache when the photo changes and is stable when it does not.
 */
export async function uploadAvatar(userId: string, bytes: Buffer, contentType: string): Promise<string> {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing = [!base && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  if (missing.length) {
    throw new Error(`Avatar storage not configured. Missing: ${missing.join(", ")}`);
  }
  const path = `${userId}.${avatarExtension(contentType)}`;
  const res = await fetch(`${base}/storage/v1/object/${AVATAR_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key!,
      "Content-Type": contentType,
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Avatar upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const v = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  return `${base}${STORED_AVATAR_PATH_MARKER}${path}?v=${v}`;
}
