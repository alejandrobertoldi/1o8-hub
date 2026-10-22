/** True when Intentwise has a row on or after the last calendar day of the period. */
export function isMonthSettled(periodEnd: string, dataThrough: string | null): boolean {
  if (!dataThrough) return false;
  return dataThrough >= periodEnd;
}
