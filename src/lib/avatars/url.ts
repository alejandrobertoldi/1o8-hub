/**
 * Pure, client-safe helpers for avatars stored in our Supabase `avatars` bucket.
 * Both login paths (auth.ts jwt callback, auth-db.ts per-request sync) use these
 * so a Google `picture` hotlink never overwrites an avatar we captured.
 */
export const STORED_AVATAR_PATH_MARKER = "/storage/v1/object/public/avatars/";

/**
 * True only for an absolute http(s) URL. users.image has held non-URL junk in
 * prod (two rows carried a timestamp), which renders as a broken <img>.
 */
export function isHttpUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

export function isStoredAvatarUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes(STORED_AVATAR_PATH_MARKER);
}

/**
 * Decide what to do with Google's `picture` at sign-in.
 * - write: value to persist to users.image, or null for "no write".
 * - tokenPicture: what the JWT (and so the client-side session) should carry.
 */
export function resolveSignInImage(args: {
  dbImage: string | null;
  profilePicture: string | null;
}): { write: string | null; tokenPicture: string | null } {
  const { profilePicture } = args;
  // A non-URL DB value is junk, never an avatar: treat it as empty.
  const dbImage = isHttpUrl(args.dbImage) ? args.dbImage : null;
  if (isStoredAvatarUrl(dbImage)) return { write: null, tokenPicture: dbImage };
  if (profilePicture && profilePicture !== dbImage) {
    return { write: profilePicture, tokenPicture: profilePicture };
  }
  return { write: null, tokenPicture: profilePicture ?? dbImage };
}
