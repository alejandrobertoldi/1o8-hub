/** Split a user.client_id_code value that may list several assigned clients. */
export function parseClientIdCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

export function sessionHasClient(
  raw: string | null | undefined,
  clientIdCode: string,
): boolean {
  return parseClientIdCodes(raw).includes(clientIdCode);
}

const STORAGE_KEY = "mfhub.portalVisibleClients";

/**
 * Intersect a stored enable-list with the user's current assignments.
 * Unknown codes are dropped. If nothing remains, fall back to every assigned client.
 */
export function selectVisibleClients(
  assigned: string[],
  stored: unknown,
): string[] {
  if (assigned.length === 0) return [];
  if (!Array.isArray(stored)) return assigned;
  const wanted = new Set(
    stored.filter((c): c is string => typeof c === "string" && c.length > 0),
  );
  const enabled = assigned.filter((c) => wanted.has(c));
  return enabled.length > 0 ? enabled : assigned;
}

export function loadVisibleClients(assigned: string[]): string[] {
  if (assigned.length === 0) return [];
  if (typeof window === "undefined") return assigned;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return assigned;
    return selectVisibleClients(assigned, JSON.parse(raw));
  } catch {
    return assigned;
  }
}

export function formatPortalClientBadge(
  codes: string[],
  names: Record<string, string>,
): string {
  if (codes.length === 0) return "Client Portal";
  const label = (c: string) => names[c] || c;
  if (codes.length === 1) return label(codes[0]!);
  if (codes.length === 2) return `${label(codes[0]!)} · ${label(codes[1]!)}`;
  return `${label(codes[0]!)} + ${codes.length - 1} more`;
}

export function persistVisibleClients(codes: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

/**
 * Which client a portal page should load.
 * Admin preview is URL-only. Client-role users follow the homepage dropdown
 * (`visible`); a `?client=` value is used only when that client is enabled.
 */
export function resolveActivePortalClient(
  visible: string[],
  urlClient: string | null | undefined,
  isAdmin: boolean,
): string | null {
  const requested = urlClient?.trim() || null;
  if (isAdmin) return requested;
  if (requested && visible.includes(requested)) return requested;
  return visible[0] ?? null;
}

/** Next enabled set after a toggle. Refuses to disable the last remaining client. */
export function toggleVisibleClient(
  assigned: string[],
  current: string[],
  code: string,
  enabled: boolean,
): string[] {
  if (!assigned.includes(code)) return current;
  if (enabled) {
    const next = assigned.filter((c) => c === code || current.includes(c));
    return next.length > 0 ? next : assigned;
  }
  const next = current.filter((c) => c !== code);
  return next.length > 0 ? next : current;
}
