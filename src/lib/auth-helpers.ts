import { parseClientIdCodes } from "@/lib/client-codes";

/**
 * Resolves a client/prospect user's effective portal section access by
 * unioning aac.allowed_sections across every assigned client id code.
 *
 * Returns [] when no codes are present.
 */
export async function resolveClientAllowedSections(
  clientIdCode: string | null,
  fetchRows: (codes: string[]) => Promise<{ allowedSections: string[] }[]>,
): Promise<string[]> {
  const codes = parseClientIdCodes(clientIdCode);
  if (codes.length === 0) return [];
  const rows = await fetchRows(codes);
  const union = new Set<string>();
  for (const r of rows) {
    for (const s of r.allowedSections ?? []) union.add(s);
  }
  return Array.from(union);
}
