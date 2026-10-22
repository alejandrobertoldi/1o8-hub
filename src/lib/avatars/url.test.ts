// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isHttpUrl, isStoredAvatarUrl, resolveSignInImage } from "./url";

const STORED = "https://lmm.supabase.co/storage/v1/object/public/avatars/u-1.png?v=abcdef0123";
const GOOGLE = "https://lh3.googleusercontent.com/a/xyz=s96-c";

describe("isStoredAvatarUrl", () => {
  it("is true for our bucket's public URL, with or without ?v=", () => {
    expect(isStoredAvatarUrl(STORED)).toBe(true);
    expect(isStoredAvatarUrl(STORED.split("?")[0])).toBe(true);
  });
  it("is false for Google hotlinks, other buckets, null and undefined", () => {
    expect(isStoredAvatarUrl(GOOGLE)).toBe(false);
    expect(isStoredAvatarUrl("https://x.supabase.co/storage/v1/object/public/other/u.png")).toBe(false);
    expect(isStoredAvatarUrl(null)).toBe(false);
    expect(isStoredAvatarUrl(undefined)).toBe(false);
  });
});

describe("resolveSignInImage", () => {
  it("never overwrites a stored avatar, and puts it in the token", () => {
    expect(resolveSignInImage({ dbImage: STORED, profilePicture: GOOGLE })).toEqual({ write: null, tokenPicture: STORED });
  });
  it("writes a new Google picture over a NULL or different non-stored image", () => {
    expect(resolveSignInImage({ dbImage: null, profilePicture: GOOGLE })).toEqual({ write: GOOGLE, tokenPicture: GOOGLE });
    expect(resolveSignInImage({ dbImage: "https://old", profilePicture: GOOGLE })).toEqual({ write: GOOGLE, tokenPicture: GOOGLE });
  });
  it("does not write when the picture is unchanged", () => {
    expect(resolveSignInImage({ dbImage: GOOGLE, profilePicture: GOOGLE })).toEqual({ write: null, tokenPicture: GOOGLE });
  });
  it("falls back to the DB image for the token when Google sends no picture", () => {
    expect(resolveSignInImage({ dbImage: "https://old", profilePicture: null })).toEqual({ write: null, tokenPicture: "https://old" });
    expect(resolveSignInImage({ dbImage: null, profilePicture: null })).toEqual({ write: null, tokenPicture: null });
  });
});

describe("isHttpUrl", () => {
  it("accepts absolute http(s) URLs only", () => {
    expect(isHttpUrl(STORED)).toBe(true);
    expect(isHttpUrl(GOOGLE)).toBe(true);
    expect(isHttpUrl("http://example.com/a.png")).toBe(true);
  });
  it("rejects timestamps, relative paths, other schemes, empty and null", () => {
    // The exact corrupt value found in two prod users.image rows (2026-09-28).
    expect(isHttpUrl("2026-07-23 23:33:19.953594+00")).toBe(false);
    expect(isHttpUrl("/avatars/u.png")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });
});

describe("resolveSignInImage with a corrupt DB image", () => {
  const CORRUPT = "2026-07-23 23:33:19.953594+00";
  it("never puts a non-URL DB value into the token", () => {
    expect(resolveSignInImage({ dbImage: CORRUPT, profilePicture: null })).toEqual({ write: null, tokenPicture: null });
  });
  it("still replaces it with Google's picture when one arrives", () => {
    expect(resolveSignInImage({ dbImage: CORRUPT, profilePicture: GOOGLE })).toEqual({ write: GOOGLE, tokenPicture: GOOGLE });
  });
});
