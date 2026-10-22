import { describe, expect, it } from "vitest";
import { accountsForUser } from "./my-accounts";

const row = (code: string, raw: Record<string, string>) => ({ clientIdCode: code, clientName: `${code} name`, clientLogoUrl: null, raw });

describe("accountsForUser", () => {
  it("returns every client where the name holds a role, with all its roles in display order", () => {
    const res = accountsForUser("Jo C.", [
      row("SOP_SC_US", { AccountManager_MF: "Jo C.", PPCManager_MF: "jo  c." }),
      row("WHI_SC_US", { ProjectManager_MF: "Someone Else" }),
      row("CFX_SC_US", { CatalogManager_MF: " JO C. " }),
    ]);
    expect(res).toEqual([
      { clientIdCode: "CFX_SC_US", clientName: "CFX_SC_US name", clientLogoUrl: null, roles: ["Catalog"] },
      { clientIdCode: "SOP_SC_US", clientName: "SOP_SC_US name", clientLogoUrl: null, roles: ["Account Manager", "PPC"] },
    ]);
  });
  it("returns [] for a null or blank name", () => {
    expect(accountsForUser(null, [row("SOP_SC_US", { AccountManager_MF: "" })])).toEqual([]);
    expect(accountsForUser("  ", [row("SOP_SC_US", { AccountManager_MF: "" })])).toEqual([]);
  });
});
