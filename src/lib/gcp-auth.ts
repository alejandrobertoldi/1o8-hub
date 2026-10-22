// ═══════════════════════════════════════════════════════════════
// Shared GCP service account auth helper
// — Extracts JWT pattern from seo-manager/export-gdoc
// — In-memory token cache with 50-min TTL (tokens expire at 60 min)
// — No googleapis dependency: raw fetch + Node.js crypto only
// ═══════════════════════════════════════════════════════════════

import crypto from "crypto";

// ── Token cache ──────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

// Keyed by scopes string (sorted scopes joined by " ")
const tokenCache = new Map<string, CachedToken>();

const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

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
    `Cannot parse GCP private key. len=${raw.length}, ` +
    `starts="${raw.substring(0, 40)}", ` +
    `hasLiteralBackslashN=${raw.includes("\\n")}, ` +
    `hasRealNewline=${raw.includes("\n")}, ` +
    `b64len=${b64.length}`
  );
}

// ── Google OAuth2 via manual JWT (RS256) ─────────────────────

function createJWT(
  email: string,
  privateKey: crypto.KeyObject,
  scopes: string[]
): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  const signature = signer.sign(privateKey, "base64url");
  return `${input}.${signature}`;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Returns a valid Google OAuth2 access token for the given scopes.
 * Credentials are read from process.env at call time (not at module init).
 * Token is cached for 50 minutes (tokens expire at 60 min).
 *
 * @param scopes - Array of OAuth2 scope URLs
 */
export async function getAccessToken(scopes: string[]): Promise<string> {
  const cacheKey = scopes.toSorted().join(" ");
  const now = Date.now();

  // Return cached token if still valid
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

  // Read env at call time — never at module init
  const email = process.env.GCP_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GCP_PRIVATE_KEY?.trim();

  if (!email || !rawKey) {
    throw new Error(
      `GCP credentials not configured. Missing: ${[!email && "GCP_CLIENT_EMAIL", !rawKey && "GCP_PRIVATE_KEY"].filter(Boolean).join(", ")}`
    );
  }

  const privateKey = parsePrivateKey(rawKey);
  const jwt = createJWT(email, privateKey, scopes);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCP token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`GCP token exchange returned no access_token: ${JSON.stringify(data)}`);
  }

  // Cache the token
  tokenCache.set(cacheKey, {
    token: data.access_token as string,
    expiresAt: now + TOKEN_TTL_MS,
  });

  return data.access_token as string;
}
