// V1 placeholder: Intentwise's Redshift schema does not carry B2B/consumer split
// columns (verified by Task 0 schema discovery — see
// docs/superpowers/research/2026-04-23-redshift-monthly-schema.md).
// This file exists to keep the type surface and registry shape consistent with
// Tasks 5/6. `fetchB2bRollup` returns null unconditionally, which causes
// `analyzeB2b` (see ./analyzers/b2b.ts) to return null, which signals the
// orchestrator to omit the B2B section.
//
// TODO(v0.2): when the Amazon SP-API Business Report is ingested into a
// dedicated `amazon_business_report` Supabase table, replace the body of
// `fetchB2bRollup` with a real query against that table.

export interface RawB2bRow {
  total_sales: number;
  b2b_sales: number;
  total_units: number;
  b2b_units: number;
}

export async function fetchB2bRollup(
  _accountId: string,
  _start: string,
  _end: string,
): Promise<RawB2bRow | null> {
  return null;
}
