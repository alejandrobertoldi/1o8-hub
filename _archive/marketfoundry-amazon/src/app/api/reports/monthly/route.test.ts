import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resolvePeriod, slugify, lastCompletedMonth } from "@/lib/monthly-report/period";

const {
  mockedGetAuthSession,
  mockedGenerateReport,
  mockedResolveConfig,
  mockedResolveMonthlyClient,
  mockedListActiveMonthlyClients,
  mockedSaveMonthlyReportPdf,
  mockedFetchAccountDataThrough,
  mockedListSummaries,
  mockedGetMonthlyReport,
  mockedUpsertGenerated,
  mockedUpdateReview,
  mockedUpdateJson,
  mockedLoadSendAddressBook,
  mockedSendResendEmail,
  mockedMarkSent,
  mockedMarkFailed,
  mockedLoadArchivedHtml,
} = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedGenerateReport: vi.fn(),
  mockedResolveConfig: vi.fn(),
  mockedResolveMonthlyClient: vi.fn(),
  mockedListActiveMonthlyClients: vi.fn(),
  mockedSaveMonthlyReportPdf: vi.fn(),
  mockedFetchAccountDataThrough: vi.fn(),
  mockedListSummaries: vi.fn(),
  mockedGetMonthlyReport: vi.fn(),
  mockedUpsertGenerated: vi.fn(),
  mockedUpdateReview: vi.fn(),
  mockedUpdateJson: vi.fn(),
  mockedLoadSendAddressBook: vi.fn(),
  mockedSendResendEmail: vi.fn(),
  mockedMarkSent: vi.fn(),
  mockedMarkFailed: vi.fn(),
  mockedLoadArchivedHtml: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/monthly-report", async () => {
  const period = await import("@/lib/monthly-report/period");
  return {
    generateReport: mockedGenerateReport,
    resolveConfig: mockedResolveConfig,
    resolvePeriod: period.resolvePeriod,
    slugify: period.slugify,
    lastCompletedMonth: period.lastCompletedMonth,
  };
});

vi.mock("@/lib/monthly-report/resolve-client", () => ({
  resolveMonthlyClient: mockedResolveMonthlyClient,
  listActiveMonthlyClients: mockedListActiveMonthlyClients,
}));
vi.mock("@/lib/monthly-report/drive-store", () => ({
  saveMonthlyReportPdf: mockedSaveMonthlyReportPdf,
  loadArchivedReportHtml: mockedLoadArchivedHtml,
}));
vi.mock("@/lib/monthly-report/queries/account", () => ({
  fetchAccountDataThrough: mockedFetchAccountDataThrough,
}));
vi.mock("@/lib/monthly-report/report-store", () => ({
  listMonthlyReportSummaries: mockedListSummaries,
  getMonthlyReport: mockedGetMonthlyReport,
  upsertGeneratedMonthlyReport: mockedUpsertGenerated,
  updateMonthlyReportReview: mockedUpdateReview,
  updateMonthlyReportJson: mockedUpdateJson,
  markMonthlyReportSent: mockedMarkSent,
  markMonthlyReportSendFailed: mockedMarkFailed,
}));
vi.mock("@/lib/monthly-report/send-context", () => ({
  loadSendAddressBook: mockedLoadSendAddressBook,
}));
vi.mock("@/lib/monthly-report/review-notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/monthly-report/review-notify")>();
  return {
    ...actual,
    notifyMonthlyReportStage: vi.fn().mockResolvedValue(undefined),
    notifyPmReportsReady: vi.fn().mockResolvedValue(undefined),
    notifyCeoFirstQueue: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("@/lib/monthly-report/resend-status", () => ({
  deliveryFromResend: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendResendEmail: mockedSendResendEmail,
  };
});

import { GET, PATCH, POST } from "./route";

const adminSession = { user: { id: "user-1", email: "admin@marketfoundry.agency", role: "admin", name: "Manu Lancharro" } };
const jakeSession = { user: { id: "u-jake", email: "jake@marketfoundry.agency", role: "editor", name: "Jake" } };

function get(url = "http://localhost/api/reports/monthly") {
  return new NextRequest(url, { method: "GET" });
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/reports/monthly", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/reports/monthly", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const ARCHIVE_HTML = `<!DOCTYPE html><html><body><div class="report-doc">full monthly report</div></body></html>`;

beforeEach(() => {
  vi.clearAllMocks();
  mockedResolveMonthlyClient.mockResolvedValue({
    status: "ok",
    client: { name: "ReadyRESCUE", accountId: "1899670", clientIdCode: "REA_SC_US", projectManager: "Sara Khan", accountManager: "Alex Moreno" },
  });
  mockedFetchAccountDataThrough.mockResolvedValue("2026-03-31");
  mockedListSummaries.mockResolvedValue([]);
  mockedUpsertGenerated.mockResolvedValue(undefined);
  mockedUpdateReview.mockResolvedValue(undefined);
  mockedUpdateJson.mockResolvedValue(undefined);
  mockedMarkSent.mockResolvedValue(undefined);
  mockedMarkFailed.mockResolvedValue(undefined);
  mockedLoadSendAddressBook.mockResolvedValue({
    greetingName: "Jamie",
    recipients: ["jamie@brand.com"],
    accountManagerEmail: "alex@marketfoundry.agency",
    namesByEmail: { "jamie@brand.com": "Jamie" },
  });
  mockedSendResendEmail.mockResolvedValue({ ok: true });
  mockedLoadArchivedHtml.mockResolvedValue(ARCHIVE_HTML);
});

describe("GET /api/reports/monthly", () => {
  it("returns every AAC-active client, including those without Intentwise", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedListActiveMonthlyClients.mockResolvedValue([
      { code: "3415610", name: "Poochie Butter", accountId: "3415610", clientIdCode: "POO_SC_US" },
      { code: "1899670", name: "ReadyRESCUE", accountId: "1899670", clientIdCode: "REA_SC_US" },
      { code: "CFX_SC_US", name: "Culture Fix", accountId: null, clientIdCode: "CFX_SC_US" },
    ]);
    mockedListSummaries.mockResolvedValue([
      {
        clientIdCode: "POO_SC_US",
        period: "2026-07",
        status: "generated",
        skipped: [],
        driveUrl: "https://drive.google.com/file/d/x/view",
        htmlUrl: null,
        dataThrough: "2026-07-31",
        createdAt: "2026-08-04T12:00:00.000Z",
      },
    ]);
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clients).toHaveLength(3);
    expect(json.clients.find((c: { name: string }) => c.name === "Culture Fix").accountId).toBeNull();
    expect(json.reports).toHaveLength(1);
    expect(json.reports[0].clientIdCode).toBe("POO_SC_US");
    expect(json.viewer).toEqual({
      name: "Manu Lancharro",
      email: "admin@marketfoundry.agency",
      canOverride: true,
      canGenerate: true,
    });
  });

  it("returns the stored report JSON for clientCode+period", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveMonthlyClient.mockResolvedValue({
      status: "ok",
      client: { name: "Poochie Butter", accountId: "3415610", clientIdCode: "POO_SC_US" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      report: { meta: { client: "Poochie Butter" } },
      skipped: ["b2b"],
      createdAt: new Date("2026-08-04T12:00:00.000Z"),
      driveUrl: "https://drive.google.com/file/d/x/view",
      htmlUrl: "https://drive.google.com/uc?export=download&id=h",
      status: "generated",
      clientIdCode: "POO_SC_US",
      period: "2026-07",
    });
    const res = await GET(get("http://localhost/api/reports/monthly?clientCode=POO_SC_US&period=2026-07"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report.meta.client).toBe("Poochie Butter");
    expect(json.skipped).toEqual(["b2b"]);
    expect(json.clientIdCode).toBe("POO_SC_US");
    expect(json.createdAt).toBe("2026-08-04T12:00:00.000Z");
    expect(mockedGetMonthlyReport).toHaveBeenCalledWith("POO_SC_US", "2026-07");
  });

  it("returns a Gmail-safe letter without sending when letter=1", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedGetMonthlyReport.mockResolvedValue({
      report: {
        meta: { client: "Poochie Butter", month: "July 2026", period: "01 Jul – 31 Jul", lead: "Alex Moreno", issued: "Aug 04", reportId: "x", clientIdCode: "POO_SC_US" },
        sections: ["kpis"],
      },
      createdAt: new Date("2026-08-04T12:00:00.000Z"),
      sentAt: null,
      sentTo: [],
      status: "ready",
      clientIdCode: "POO_SC_US",
      period: "2026-07",
      driveUrl: "https://drive.google.com/file/d/abc/view",
      htmlUrl: null,
    });
    const res = await GET(get("http://localhost/api/reports/monthly?clientCode=POO_SC_US&period=2026-07&letter=1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subject).toMatch(/Poochie Butter/);
    expect(json.html).toContain("max-width:600px");
    expect(json.html).toContain("Poochie Butter");
    expect(json.html).not.toContain("report-doc");
    expect(json.html).not.toContain("localhost");
    expect(json.html).toContain("Your July 2026 Amazon performance snapshot is ready");
    expect(json.html).not.toMatch(/\bHi[, ]/);
    expect(json.html).toContain("Issued Aug 04, 2026");
    expect(json.html).toContain("Click for more details");
    expect(json.html).toContain("/portal/reports/monthly?period=2026-07");
    expect(json.html).toContain("client=POO_SC_US");
    expect(json.text).toContain("Poochie Butter");
    expect(json.recipients).toEqual(["jamie@brand.com"]);
    expect(json.replyTo).toBe("alex@marketfoundry.agency");
    expect(json.cc).toEqual(["alex@marketfoundry.agency", "jake@marketfoundry.agency"]);
    expect(mockedSendResendEmail).not.toHaveBeenCalled();
    expect(mockedLoadArchivedHtml).not.toHaveBeenCalled();
  });

  it("404 when no stored report exists for clientCode+period", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedGetMonthlyReport.mockResolvedValue(null);
    const res = await GET(get("http://localhost/api/reports/monthly?clientCode=1899670&period=2026-03"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/reports/monthly", () => {
  it("401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(401);
  });

  it("403 when not admin", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { email: "x", role: "viewer" } });
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(403);
  });

  it("400 when clientCode missing", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(post({ period: "2026-03" }));
    expect(res.status).toBe(400);
  });

  it("400 when period is future", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(post({ clientCode: "1899670", period: "2099-01" }));
    expect(res.status).toBe(400);
  });

  it("400 when period is malformed", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    const res = await POST(post({ clientCode: "1899670", period: "bad" }));
    expect(res.status).toBe(400);
  });

  it("404 when unknown clientCode", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveMonthlyClient.mockResolvedValueOnce({ status: "not_found" });
    const res = await POST(post({ clientCode: "NOSUCH", period: "2026-03" }));
    expect(res.status).toBe(404);
  });

  it("400 when the AAC client has no Intentwise account", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveMonthlyClient.mockResolvedValueOnce({ status: "no_intentwise", name: "Culture Fix" });
    const res = await POST(post({ clientCode: "CFX_SC_US", period: "2026-03" }));
    expect(res.status).toBe(400);
  });

  it("200 with summary {skipped, driveUrl, htmlUrl, status} on happy path", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveConfig.mockResolvedValue({ enabled: { products: true, kpis: true } });
    mockedGenerateReport.mockResolvedValue({
      report: {
        meta: { client: "Dr. Cuddles" },
        sections: ["cover", "toc", "kpis", "mom", "appendix"],
      },
      headline: null,
      skipped: [],
    });
    mockedSaveMonthlyReportPdf.mockResolvedValue({
      driveUrl: "https://drive.google.com/file/d/abc/view",
      driveId: "abc",
      filename: "REA_SC_US_2026-03_monthly-report.pdf",
      overwritten: false,
      htmlUrl: "https://drive.google.com/uc?export=download&id=html-abc",
      htmlFilename: "REA_SC_US_2026-03_monthly-report.html",
    });
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report).toBeUndefined();
    expect(json.skipped).toBeInstanceOf(Array);
    expect(json.driveUrl).toBe("https://drive.google.com/file/d/abc/view");
    expect(json.htmlUrl).toBe("https://drive.google.com/uc?export=download&id=html-abc");
    expect(json.status).toBe("generated");
    expect(json.clientIdCode).toBe("REA_SC_US");
    expect(mockedUpsertGenerated).toHaveBeenCalledWith(expect.objectContaining({
      clientIdCode: "REA_SC_US",
      period: "2026-03",
      driveUrl: "https://drive.google.com/file/d/abc/view",
    }));
    expect(mockedSaveMonthlyReportPdf).toHaveBeenCalledWith(expect.objectContaining({
      clientIdCode: "REA_SC_US",
      period: "2026-03",
    }));
    // Fields removed in V1.1:
    expect(json.html).toBeUndefined();
    expect(json.filename).toBeUndefined();
    expect(json.headline).toBeUndefined();
  });

  it("409 when Intentwise data has not reached month-end", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedFetchAccountDataThrough.mockResolvedValueOnce("2026-03-20");
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("data_not_settled");
    expect(body.retryable).toBe(true);
    expect(mockedGenerateReport).not.toHaveBeenCalled();
  });

  it("500 when Drive save fails after the report is built", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveConfig.mockResolvedValue({ enabled: { products: true, kpis: true } });
    mockedGenerateReport.mockResolvedValue({
      report: { meta: { client: "Dr. Cuddles" }, sections: ["cover"] },
      headline: null,
      skipped: [],
    });
    mockedSaveMonthlyReportPdf.mockRejectedValue(new Error("Drive API error"));
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Drive API error/);
  });

  it("502 when Chromium is busy extracting the binary", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedResolveConfig.mockResolvedValue({ enabled: { products: true, kpis: true } });
    mockedGenerateReport.mockResolvedValue({
      report: { meta: { client: "Dr. Cuddles" }, sections: ["cover"] },
      headline: null,
      skipped: [],
    });
    mockedSaveMonthlyReportPdf.mockRejectedValue(new Error("spawn ETXTBSY"));
    const res = await POST(post({ clientCode: "1899670", period: "2026-03" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.retryable).toBe(true);
  });
});

describe("PATCH /api/reports/monthly", () => {
  it("admin cannot approve a report they are not assigned to", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedGetMonthlyReport.mockResolvedValue({
      status: "generated",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "approve" }));
    expect(res.status).toBe(403);
    expect(mockedUpdateReview).not.toHaveBeenCalled();
  });

  it("AM cannot approve at PM review", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u2", email: "alex@marketfoundry.agency", role: "editor", name: "Alex Moreno" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "generated",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "approve" }));
    expect(res.status).toBe(403);
    expect(mockedUpdateReview).not.toHaveBeenCalled();
  });

  it("named PM approves, then named AM approves to jake_review", async () => {
    mockedGetMonthlyReport.mockResolvedValue({
      status: "generated",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    });
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u3", email: "sara@marketfoundry.agency", role: "editor", name: "Sara Khan" },
    });
    const pmRes = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "approve" }));
    expect(pmRes.status).toBe(200);
    expect((await pmRes.json()).status).toBe("am_review");

    mockedGetMonthlyReport.mockResolvedValue({
      status: "am_review",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    });
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u2", email: "alex@marketfoundry.agency", role: "editor", name: "Alex Moreno" },
    });
    const amRes = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "approve" }));
    expect(amRes.status).toBe(200);
    expect((await amRes.json()).status).toBe("jake_review");
  });

  it("Jake approve auto-sends the client letter", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u-jake", email: "jake@marketfoundry.agency", role: "editor", name: "Jake" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "jake_review",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: {
        meta: { client: "ReadyRESCUE", month: "July 2026", period: "01 Jul – 31 Jul", lead: "Alex Moreno", issued: "Aug 04", reportId: "x", clientIdCode: "REA_SC_US" },
        sections: ["kpis"],
      },
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "approve" }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("sent");
    expect(mockedMarkSent).toHaveBeenCalled();
    expect(mockedSendResendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "1o8 <reports@marketfoundry.agency>",
    }));
  });

  it("AM writes a client note onto a KPI section", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u2", email: "alex@marketfoundry.agency", role: "editor", name: "Alex Moreno" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "am_review",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: {
        meta: { client: "ReadyRESCUE" },
        sections: ["kpis"],
      },
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "comment",
      sectionId: "kpis",
      text: "Prime Day pulled sessions down; conversion held.",
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report.sectionComments.kpis.text).toBe("Prime Day pulled sessions down; conversion held.");
    expect(json.report.sectionComments.kpis.role).toBe("am");
    expect(json.report.sectionComments.kpis.authorName).toBe("Alex Moreno");
    expect(mockedUpdateJson).toHaveBeenCalledWith(expect.objectContaining({
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    }));
  });

  it("403 when the client's PM tries to comment", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u3", email: "sara@marketfoundry.agency", role: "editor", name: "Sara Khan" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "generated",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: { meta: { client: "ReadyRESCUE" }, sections: ["kpis"] },
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "comment",
      sectionId: "kpis",
      text: "PM note",
    }));
    expect(res.status).toBe(403);
    expect(mockedUpdateJson).not.toHaveBeenCalled();
  });

  it("403 when a non-reviewer tries to comment", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u4", email: "other@marketfoundry.agency", role: "editor", name: "Babar Ahmad" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "generated",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: { meta: { client: "ReadyRESCUE" }, sections: ["kpis"] },
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "comment",
      sectionId: "kpis",
      text: "Nope",
    }));
    expect(res.status).toBe(403);
    expect(mockedUpdateJson).not.toHaveBeenCalled();
  });


  it("send_back stores a note and returns to generated", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u2", email: "alex@marketfoundry.agency", role: "editor", name: "Alex Moreno" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "am_review",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "send_back",
      note: "Check units on cover",
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "generated", reviewNote: "Check units on cover" });
    expect(mockedUpdateReview).toHaveBeenCalledWith(expect.objectContaining({
      status: "generated",
      reviewNote: "Check units on cover",
    }));
  });

  it("409 when the report is already ready", async () => {
    mockedGetAuthSession.mockResolvedValue(adminSession);
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "approve" }));
    expect(res.status).toBe(409);
    expect(mockedUpdateReview).not.toHaveBeenCalled();
  });

  it("Jake send posts the letter HTML with Reply-To, plain text, and no PDF attachment", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u2", email: "jake@marketfoundry.agency", role: "editor", name: "Jake" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      createdAt: new Date("2026-08-04T12:00:00.000Z"),
      driveUrl: "https://drive.google.com/file/d/abc/view",
      htmlUrl: null,
      report: {
        meta: { client: "ReadyRESCUE", month: "July 2026", period: "01 Jul – 31 Jul", lead: "Alex Moreno", issued: "Sep 08, 2026", reportId: "x", clientIdCode: "REA_SC_US" },
        sections: ["kpis"],
      },
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "send" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("sent");
    expect(json.sentTo).toEqual(["jamie@brand.com"]);
    expect(json.replyTo).toBe("alex@marketfoundry.agency");
    expect(json.cc).toEqual(["alex@marketfoundry.agency", "jake@marketfoundry.agency"]);
    expect(mockedSendResendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ["jamie@brand.com"],
      replyTo: "alex@marketfoundry.agency",
      cc: ["alex@marketfoundry.agency", "jake@marketfoundry.agency"],
      subject: "ReadyRESCUE — July 2026 performance",
    }));
    const sent = mockedSendResendEmail.mock.calls[0][0];
    expect(sent.html).toContain("max-width:600px");
    expect(sent.html).toContain("ReadyRESCUE");
    expect(sent.html).toContain("Issued Aug 04, 2026");
    expect(sent.html).not.toContain("Issued Sep 08, 2026");
    expect(sent.html).toContain("Click for more details");
    expect(sent.html).toContain("/portal/reports/monthly?period=2026-07");
    expect(sent.html).toContain("client=REA_SC_US");
    expect(sent.html).not.toContain("Open PDF");
    expect(sent.html).not.toContain("drive.google.com");
    expect(sent.html).not.toContain("report-doc");
    expect(sent.text).toContain("ReadyRESCUE");
    expect(sent.attachments).toBeUndefined();
    expect(mockedLoadArchivedHtml).not.toHaveBeenCalled();
    expect(mockedMarkSent).toHaveBeenCalledWith(expect.objectContaining({
      clientIdCode: "REA_SC_US",
      sentTo: ["jamie@brand.com"],
    }));
    expect(mockedMarkSent.mock.calls[0][0].emailHtml).toContain("max-width:600px");
    expect(sent.html).toContain("Your July 2026 Amazon performance snapshot is ready");
    expect(sent.html).not.toMatch(/\bHi[, ]/);
    expect(sent.headers?.["X-Entity-Ref-ID"]).toEqual(expect.any(String));
    expect(String(sent.headers["X-Entity-Ref-ID"]).length).toBeGreaterThan(8);
    expect(sent.html).toContain(sent.headers["X-Entity-Ref-ID"]);
  });

  it("sends to the requested extra recipient, not the AAC primary contact", async () => {
    mockedGetAuthSession.mockResolvedValue(jakeSession);
    mockedLoadSendAddressBook.mockResolvedValueOnce({
      greetingName: "Jake Kosten",
      recipients: ["jake@gaffer.com"],
      accountManagerEmail: "aqib@marketfoundry.agency",
      namesByEmail: {
        "jake@gaffer.com": "Jake Kosten",
        "manuel.lancharro@1o8.agency": "Manuel Lancharro",
      },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "GAF_SC_US",
      period: "2026-07",
      report: {
        meta: { client: "Gaffer", month: "July 2026", period: "", lead: "Aqib Abbasi", issued: "", reportId: "x", clientIdCode: "GAF_SC_US" },
        sections: [],
      },
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "send",
      recipients: ["manuel.lancharro@1o8.agency"],
      extraRecipients: ["manuel.lancharro@1o8.agency"],
    }));
    expect(res.status).toBe(200);
    const sent = mockedSendResendEmail.mock.calls[0][0];
    expect(sent.to).toEqual(["manuel.lancharro@1o8.agency"]);
    expect(sent.replyTo).toBe("aqib@marketfoundry.agency");
    expect(sent.cc).toEqual(["aqib@marketfoundry.agency", "jake@marketfoundry.agency"]);
    expect(sent.html).toContain("Your July 2026 Amazon performance snapshot is ready");
    expect(sent.html).not.toMatch(/\bHi[, ]/);
    expect(sent.html).not.toContain("Jake Kosten");
    expect(sent.html).toContain("/portal/reports/monthly?period=2026-07");
  });

  it("AM cannot send a ready report", async () => {
    mockedGetAuthSession.mockResolvedValue({
      user: { id: "u3", email: "sara@marketfoundry.agency", role: "editor", name: "Sara Khan" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: { meta: { client: "ReadyRESCUE" }, sections: [] },
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "send" }));
    expect(res.status).toBe(403);
    expect(mockedSendResendEmail).not.toHaveBeenCalled();
  });

  it("sends only the enabled recipients from the request", async () => {
    mockedGetAuthSession.mockResolvedValue(jakeSession);
    mockedLoadSendAddressBook.mockResolvedValueOnce({
      greetingName: "Jamie",
      recipients: ["jamie@brand.com", "ops@brand.com"],
      accountManagerEmail: "alex@marketfoundry.agency",
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: {
        meta: { client: "ReadyRESCUE", month: "July 2026", period: "", lead: "Alex", issued: "", reportId: "x" },
        sections: [],
      },
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "send",
      recipients: ["ops@brand.com", "intruder@evil.com"],
    }));
    expect(res.status).toBe(200);
    expect(mockedSendResendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ["ops@brand.com"],
    }));
    expect(mockedMarkSent).toHaveBeenCalledWith(expect.objectContaining({
      sentTo: ["ops@brand.com"],
    }));
  });

  it("sends custom extra recipients for that month", async () => {
    mockedGetAuthSession.mockResolvedValue(jakeSession);
    mockedLoadSendAddressBook.mockResolvedValueOnce({
      greetingName: "Jamie",
      recipients: ["jamie@brand.com"],
      accountManagerEmail: "alex@marketfoundry.agency",
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: {
        meta: { client: "ReadyRESCUE", month: "July 2026", period: "", lead: "Alex", issued: "", reportId: "x" },
        sections: [],
      },
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "send",
      recipients: ["jamie@brand.com", "cfo@brand.com"],
      extraRecipients: ["cfo@brand.com"],
    }));
    expect(res.status).toBe(200);
    expect(mockedSendResendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ["jamie@brand.com", "cfo@brand.com"],
    }));
  });

  it("409 when every requested recipient is disabled", async () => {
    mockedGetAuthSession.mockResolvedValue(jakeSession);
    mockedLoadSendAddressBook.mockResolvedValueOnce({
      greetingName: "Jamie",
      recipients: ["jamie@brand.com"],
      accountManagerEmail: "alex@marketfoundry.agency",
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: { meta: { client: "ReadyRESCUE", month: "July 2026", period: "", lead: "Alex", issued: "", reportId: "x" }, sections: [] },
    });
    const res = await PATCH(patch({
      clientCode: "1899670",
      period: "2026-07",
      action: "send",
      recipients: [],
    }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "No recipients enabled" });
    expect(mockedSendResendEmail).not.toHaveBeenCalled();
  });

  it("409 when the client has no AM email for Reply-To", async () => {
    mockedGetAuthSession.mockResolvedValue(jakeSession);
    mockedLoadSendAddressBook.mockResolvedValueOnce({
      greetingName: "Jamie",
      recipients: ["jamie@brand.com"],
      accountManagerEmail: null,
      namesByEmail: { "jamie@brand.com": "Jamie" },
    });
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: { meta: { client: "ReadyRESCUE" }, sections: [] },
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "send" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "No AM email on this client — cannot set Reply-To" });
    expect(mockedSendResendEmail).not.toHaveBeenCalled();
  });

  it("409 when send is missing recipients", async () => {
    mockedGetAuthSession.mockResolvedValue(jakeSession);
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: { meta: { client: "ReadyRESCUE", month: "July 2026", period: "", lead: "Alex", issued: "", reportId: "x" }, sections: [] },
    });
    mockedLoadSendAddressBook.mockResolvedValueOnce({
      greetingName: null,
      recipients: [],
      accountManagerEmail: "alex@marketfoundry.agency",
    });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "send" }));
    expect(res.status).toBe(409);
    expect(mockedSendResendEmail).not.toHaveBeenCalled();
  });

  it("502 and failed when Resend errors", async () => {
    mockedGetAuthSession.mockResolvedValue(jakeSession);
    mockedGetMonthlyReport.mockResolvedValue({
      status: "ready",
      clientIdCode: "REA_SC_US",
      period: "2026-07",
      report: { meta: { client: "ReadyRESCUE", month: "July 2026", period: "", lead: "Alex", issued: "", reportId: "x" }, sections: [] },
    });
    mockedSendResendEmail.mockResolvedValueOnce({ ok: false, error: "Resend HTTP 429" });
    const res = await PATCH(patch({ clientCode: "1899670", period: "2026-07", action: "send" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ status: "failed", retryable: true });
    expect(mockedMarkFailed).toHaveBeenCalled();
    expect(mockedMarkSent).not.toHaveBeenCalled();
  });
});

// suppress unused import warnings — these are imported to verify they exist
void resolvePeriod;
void slugify;
void lastCompletedMonth;
