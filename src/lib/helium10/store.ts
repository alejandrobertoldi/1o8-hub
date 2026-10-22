import { db } from "@/lib/db";
import { helium10Connections } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { seal, unseal } from "./credentials";
import { HeliumProvider, type ConnectionData } from "./client";

export function hubOrigin(): string {
  const configured = process.env.NEXTAUTH_URL;
  if (!configured) throw new Error("Configure NEXTAUTH_URL before connecting Helium 10.");
  const url = new URL(configured);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Helium 10 requires an HTTPS Hub URL.");
  return url.origin;
}

export async function connectionStatus(userId: string) {
  const [row] = await db.select().from(helium10Connections).where(eq(helium10Connections.userId, userId)).limit(1);
  return !!(row && unseal<ConnectionData>(row.ciphertext, userId).tokens);
}

export async function withConnection<T>(userId: string, run: (provider: HeliumProvider) => Promise<T>): Promise<T> {
  const origin = hubOrigin();
  const outcome = await db.transaction(async tx => {
    // Serialize rotating refresh tokens across processes. Fail quickly on a concurrent fetch.
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.insert(helium10Connections).values({ userId, ciphertext: seal({}, userId) }).onConflictDoNothing();
    const [row] = await tx.select().from(helium10Connections).where(eq(helium10Connections.userId, userId)).for("update");
    const provider = new HeliumProvider(unseal<ConnectionData>(row.ciphertext, userId), origin);
    let result: { ok: true; value: T } | { ok: false; error: unknown };
    try { result = { ok: true, value: await run(provider) }; }
    catch (error) { result = { ok: false, error }; }
    // Commit refreshed tokens and consumed OAuth state even if a later tool call failed.
    await tx.update(helium10Connections).set({ ciphertext: seal(provider.data, userId), updatedAt: new Date() }).where(eq(helium10Connections.userId, userId));
    return result;
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

// One administrator-configured connection; never fall back to an operator's account.
export function sharedConnectionOwner(): string {
  const id = process.env.HELIUM10_CONNECTION_OWNER_ID;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("An administrator must configure the shared Helium 10 connection.");
  }
  return id;
}
export function withSharedConnection<T>(run: (provider: HeliumProvider) => Promise<T>) {
  return withConnection(sharedConnectionOwner(), run);
}
export function sharedConnectionStatus() {
  return connectionStatus(sharedConnectionOwner());
}
