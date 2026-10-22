import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockedListFiles, mockedUpdateFileContent, mockedUploadFile, mockedDbSelect } = vi.hoisted(() => ({
  mockedListFiles: vi.fn(),
  mockedUpdateFileContent: vi.fn(),
  mockedUploadFile: vi.fn(),
  mockedDbSelect: vi.fn(),
}));

vi.mock("@/lib/drive-client", () => ({
  driveClient: {
    listFiles: mockedListFiles,
    updateFileContent: mockedUpdateFileContent,
    uploadFile: mockedUploadFile,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockedDbSelect(...args),
  },
}));

import {
  reportsFolderName,
  monthlyReportsFolderName,
  reportsFolderPath,
  monthlyReportsFolderPath,
  monthlyReportPdfFilename,
  monthlyReportHtmlFilename,
  upsertMonthlyReportPdf,
  upsertMonthlyReportHtml,
  findMonthlyReportHtml,
  driveFileViewUrl,
  driveFileDownloadUrl,
} from "./drive-store";

describe("monthly report Drive naming", () => {
  it("nests monthly reports under {CODE}_Reports/{CODE}_Monthly_Reports", () => {
    expect(reportsFolderName("BNT_SC_US")).toBe("BNT_SC_US_Reports");
    expect(monthlyReportsFolderName("BNT_SC_US")).toBe("BNT_SC_US_Monthly_Reports");
    expect(reportsFolderPath("BNT_SC_US")).toBe("BNT_SC_US/Reports");
    expect(monthlyReportsFolderPath("BNT_SC_US")).toBe("BNT_SC_US/Reports/Monthly_Reports");
  });

  it("names the PDF by client and period so regenerations overwrite", () => {
    expect(monthlyReportPdfFilename("BNT_SC_US", "2026-07")).toBe(
      "BNT_SC_US_2026-07_monthly-report.pdf"
    );
    expect(monthlyReportHtmlFilename("BNT_SC_US", "2026-07")).toBe(
      "BNT_SC_US_2026-07_monthly-report.html"
    );
  });
});

describe("upsertMonthlyReportPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads when no file exists for that client and month", async () => {
    mockedListFiles.mockResolvedValue({ files: [] });
    mockedUploadFile.mockResolvedValue({ id: "new-file" });
    const pdf = Buffer.from("pdf");
    const result = await upsertMonthlyReportPdf({
      folderDriveId: "folder-1",
      clientIdCode: "BNT_SC_US",
      period: "2026-07",
      pdfBuffer: pdf,
    });
    expect(mockedUploadFile).toHaveBeenCalledWith(
      "BNT_SC_US_2026-07_monthly-report.pdf",
      "folder-1",
      pdf,
      "application/pdf",
    );
    expect(mockedUpdateFileContent).not.toHaveBeenCalled();
    expect(result).toEqual({
      driveId: "new-file",
      filename: "BNT_SC_US_2026-07_monthly-report.pdf",
      overwritten: false,
    });
  });

  it("overwrites the existing PDF for the same client and month", async () => {
    mockedListFiles.mockResolvedValue({ files: [{ id: "old-file" }] });
    mockedUpdateFileContent.mockResolvedValue({ id: "old-file" });
    const pdf = Buffer.from("pdf-v2");
    const result = await upsertMonthlyReportPdf({
      folderDriveId: "folder-1",
      clientIdCode: "BNT_SC_US",
      period: "2026-07",
      pdfBuffer: pdf,
    });
    expect(mockedUpdateFileContent).toHaveBeenCalledWith("old-file", pdf, "application/pdf");
    expect(mockedUploadFile).not.toHaveBeenCalled();
    expect(result.overwritten).toBe(true);
    expect(result.driveId).toBe("old-file");
  });
});

describe("upsertMonthlyReportHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads an HTML sibling next to the PDF", async () => {
    mockedListFiles.mockResolvedValue({ files: [] });
    mockedUploadFile.mockResolvedValue({ id: "html-file" });
    const html = Buffer.from("<html></html>");
    const result = await upsertMonthlyReportHtml({
      folderDriveId: "folder-1",
      clientIdCode: "BNT_SC_US",
      period: "2026-07",
      htmlBuffer: html,
    });
    expect(mockedUploadFile).toHaveBeenCalledWith(
      "BNT_SC_US_2026-07_monthly-report.html",
      "folder-1",
      html,
      "text/html",
    );
    expect(result).toEqual({
      driveId: "html-file",
      filename: "BNT_SC_US_2026-07_monthly-report.html",
      overwritten: false,
    });
  });
});

describe("Drive file URLs", () => {
  it("builds a view URL for the PDF and a download URL for the HTML", () => {
    expect(driveFileViewUrl("abc")).toBe("https://drive.google.com/file/d/abc/view");
    expect(driveFileDownloadUrl("html-abc")).toBe(
      "https://drive.google.com/uc?export=download&id=html-abc",
    );
  });
});

describe("findMonthlyReportHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ driveFolderId: "folder-1" }]),
        }),
      }),
    });
  });

  it("returns the HTML file already stored next to the PDF", async () => {
    mockedListFiles.mockResolvedValue({ files: [{ id: "html-file" }] });
    const result = await findMonthlyReportHtml({
      clientIdCode: "BNT_SC_US",
      period: "2026-07",
    });
    expect(result).toEqual({
      driveId: "html-file",
      filename: "BNT_SC_US_2026-07_monthly-report.html",
    });
    expect(mockedListFiles).toHaveBeenCalledWith(
      expect.stringContaining("BNT_SC_US_2026-07_monthly-report.html"),
    );
  });

  it("returns null when the HTML archive is missing", async () => {
    mockedListFiles.mockResolvedValue({ files: [] });
    const result = await findMonthlyReportHtml({
      clientIdCode: "BNT_SC_US",
      period: "2026-07",
    });
    expect(result).toBeNull();
  });

  it("returns null when the monthly reports folder is not in the DB", async () => {
    mockedDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });
    const result = await findMonthlyReportHtml({
      clientIdCode: "BNT_SC_US",
      period: "2026-07",
    });
    expect(result).toBeNull();
    expect(mockedListFiles).not.toHaveBeenCalled();
  });
});
