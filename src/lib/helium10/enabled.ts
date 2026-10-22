// Off switch for every Helium 10 connection (S2 keyword fetch, review topics/history, admin connect).
// Off unless NEXT_PUBLIC_HELIUM10_ENABLED is exactly "true"; then S2 and S3 use CSV uploads (Cerebro /
// review exports). NEXT_PUBLIC_ so client pages (S2, S3, nav) can read it too.
export function helium10Enabled(): boolean {
  return process.env.NEXT_PUBLIC_HELIUM10_ENABLED === "true";
}
