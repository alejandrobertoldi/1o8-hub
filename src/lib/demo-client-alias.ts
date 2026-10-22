/**
 * Prospect / demo client aliases.
 *
 * Some AAC clients (e.g. Zingora / ZIN_SC_US) have no Intentwise sales feed yet.
 * For prospect demos we borrow live metrics from a real donor client and rebrand
 * the response — no DB seeding (DEV = PROD).
 */

/** Demo client code → donor client whose Redshift / Intentwise data we reuse */
export const DEMO_DATA_SOURCE: Record<string, string> = {
  ZIN_SC_US: "PUR_SC_US", // Zingora ← Pura
};

/** Display overrides so the card never shows the raw AAC code twice */
export const DEMO_CLIENT_DISPLAY: Record<
  string,
  { clientName: string; brandName: string }
> = {
  ZIN_SC_US: { clientName: "Zingora", brandName: "Zingora" },
};

export function resolveDemoDataSource(clientIdCode: string): string {
  return DEMO_DATA_SOURCE[clientIdCode] ?? clientIdCode;
}

export function isDemoAliasedClient(clientIdCode: string): boolean {
  return clientIdCode in DEMO_DATA_SOURCE;
}

type ClientLike = {
  clientIdCode: string;
  clientName?: string | null;
  brandName?: string | null;
};

/**
 * When filtering sales-summary to a demo client (or overlaying a list that
 * includes one), replace empty/missing demo rows with the donor client's
 * metrics while keeping Zingora identity.
 * Also used by sales-monitor via resolveDemoDataSource().
 */
export function applyDemoClientAlias<T extends ClientLike>(
  clients: T[],
  clientParam?: string | null
): T[] {
  const target =
    clientParam && isDemoAliasedClient(clientParam) ? clientParam : null;

  if (target) {
    const sourceCode = DEMO_DATA_SOURCE[target];
    const source = clients.find((c) => c.clientIdCode === sourceCode);
    const display = DEMO_CLIENT_DISPLAY[target];
    if (!source || !display) return clients.filter((c) => c.clientIdCode === target);
    return [
      {
        ...source,
        clientIdCode: target,
        clientName: display.clientName,
        brandName: display.brandName,
      },
    ];
  }

  return clients.map((c) => {
    const sourceCode = DEMO_DATA_SOURCE[c.clientIdCode];
    if (!sourceCode) return c;
    const source = clients.find((x) => x.clientIdCode === sourceCode);
    const display = DEMO_CLIENT_DISPLAY[c.clientIdCode];
    if (!source || !display) {
      return display
        ? { ...c, clientName: display.clientName, brandName: display.brandName }
        : c;
    }
    return {
      ...source,
      clientIdCode: c.clientIdCode,
      clientName: display.clientName,
      brandName: display.brandName,
    };
  });
}
