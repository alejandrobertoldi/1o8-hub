import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/analytics-queries", () => ({ adminExportEntries: vi.fn() }));
vi.mock("@/lib/drive-client", () => ({
  sharedDriveId: vi.fn(() => "shared-root"),
  driveClient: {
    findChildFolder: vi.fn(),
    createFolder: vi.fn(),
    uploadAsSheet: vi.fn(),
  },
}));

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { adminExportEntries } from "@/lib/hours/analytics-queries";
import { driveClient } from "@/lib/drive-client";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const SUPER = { user: { id: "u1", role: "owner", isSuperAdmin: true } };
const EDITOR = { user: { id: "u2", role: "editor", isSuperAdmin: false } };

const ROW = {
  entryDate: "2026-07-16",
  hours: "2.50",
  note: "Standup",
  department: "Internal Meetings",
  projectNumber: "1O800000",
  projectName: "General internal work",
  billingType: "Internal (non-billable)",
  clientIdCode: "INTERNAL",
  userName: "Ana",
  userEmail: "ana@marketfoundry.agency",
};

function req(method: "GET" | "POST", params: [string, string][]): NextRequest {
  const url = new URL("http://localhost/api/hours/admin-export");
  for (const [k, v] of params) url.searchParams.append(k, v);
  return new NextRequest(url, { method });
}
const RANGE: [string, string][] = [["from", "2026-07-01"], ["to", "2026-07-31"]];

describe("/api/hours/admin-export", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([["GET", GET], ["POST", POST]] as const)("%s 401 unauthenticated, 403 non-super-admin", async (m, fn) => {
    asMock(getAuthSession).mockResolvedValue(null);
    expect((await fn(req(m, RANGE))).status).toBe(401);
    asMock(getAuthSession).mockResolvedValue(EDITOR);
    expect((await fn(req(m, RANGE))).status).toBe(403);
    expect(adminExportEntries).not.toHaveBeenCalled();
  });

  it("400 on bad or inverted range", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    expect((await GET(req("GET", [["from", "2026-7-1"], ["to", "2026-07-31"]]))).status).toBe(400);
    expect((await GET(req("GET", [["from", "2026-08-01"], ["to", "2026-07-31"]]))).status).toBe(400);
  });

  it("GET passes every filter through and returns an xlsx attachment", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(adminExportEntries).mockResolvedValue([ROW]);
    const res = await GET(req("GET", [
      ...RANGE, ["userId", "a"], ["userId", "b"], ["client", "INTERNAL"], ["category", "Meetings"],
    ]));
    expect(res.status).toBe(200);
    expect(adminExportEntries).toHaveBeenCalledWith({
      from: "2026-07-01", to: "2026-07-31",
      userIds: ["a", "b"], clientIdCodes: ["INTERNAL"], categories: ["Meetings"],
    });
    expect(res.headers.get("Content-Disposition")).toContain("team_hours_2026-07-01_2026-07-31.xlsx");
    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets["Team hours"], { header: 1 });
    expect(aoa[1][0]).toBe("Ana");
  });

  it("POST 400 when nothing matches, without touching Drive", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(adminExportEntries).mockResolvedValue([]);
    expect((await POST(req("POST", RANGE))).status).toBe(400);
    expect(driveClient.uploadAsSheet).not.toHaveBeenCalled();
  });

  it("POST reuses an existing 1o8_Hours_Exports folder and returns the sheet URL", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(adminExportEntries).mockResolvedValue([ROW]);
    asMock(driveClient.findChildFolder).mockResolvedValue({ id: "folder-1" });
    asMock(driveClient.uploadAsSheet).mockResolvedValue({ id: "sheet-1", name: "x" });
    const res = await POST(req("POST", RANGE));
    expect(res.status).toBe(200);
    expect(driveClient.findChildFolder).toHaveBeenCalledWith("shared-root", "1o8_Hours_Exports");
    expect(driveClient.createFolder).not.toHaveBeenCalled();
    const [name, folder] = asMock(driveClient.uploadAsSheet).mock.calls[0];
    expect(name).toMatch(/^team_hours_2026-07-01_2026-07-31_/);
    expect(folder).toBe("folder-1");
    const json = await res.json();
    expect(json).toMatchObject({ sheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit", count: 1 });
  });

  it("POST creates the folder when missing", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(adminExportEntries).mockResolvedValue([ROW]);
    asMock(driveClient.findChildFolder).mockResolvedValue(null);
    asMock(driveClient.createFolder).mockResolvedValue({ id: "new-folder" });
    asMock(driveClient.uploadAsSheet).mockResolvedValue({ id: "sheet-2", name: "x" });
    await POST(req("POST", RANGE));
    expect(driveClient.createFolder).toHaveBeenCalledWith("1o8_Hours_Exports", "shared-root");
    expect(asMock(driveClient.uploadAsSheet).mock.calls[0][1]).toBe("new-folder");
  });
});
