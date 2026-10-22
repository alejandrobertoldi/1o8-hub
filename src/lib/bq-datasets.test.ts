import { describe, it, expect, vi, afterEach } from "vitest";
import {
  bibleAppProjectId,
  bibleAppDataset,
  bibleAppLocation,
  bibleAppTable,
  seoProjectId,
  seoDataset,
  seoOutPaPlusTableName,
  seoOutPaPlusTable,
  maacProjectId,
  maacDataset,
  maacTableName,
  maacAacTable,
} from "./bq-datasets";

afterEach(() => vi.unstubAllEnvs());

describe("bq-datasets defaults (1o8, behavior unchanged)", () => {
  it("BibleApp defaults", () => {
    expect(bibleAppProjectId()).toBe("mfhub-501815");
    expect(bibleAppDataset()).toBe("MFBibleApp");
    expect(bibleAppLocation()).toBe("us-west1");
    expect(bibleAppTable("AAC")).toBe("mfhub-501815.MFBibleApp.AAC");
    expect(bibleAppTable("Attributes")).toBe(
      "mfhub-501815.MFBibleApp.Attributes"
    );
  });

  it("SEO / OUT_PA+ defaults (single-pair canonical FQN, no inner backticks)", () => {
    expect(seoProjectId()).toBe("mfhub-501815");
    expect(seoDataset()).toBe("MFSEO");
    expect(seoOutPaPlusTableName()).toBe("OUT_PA+");
    expect(seoOutPaPlusTable()).toBe("mfhub-501815.MFSEO.OUT_PA+");
    // raw FQN must NOT contain a backtick — caller wraps once
    expect(seoOutPaPlusTable()).not.toContain("`");
  });

  it("MAAC defaults", () => {
    expect(maacProjectId()).toBe("mfhub-501815");
    expect(maacDataset()).toBe("MFAAC");
    expect(maacTableName()).toBe("1o8MAAC_AAC");
    expect(maacAacTable()).toBe("mfhub-501815.MFAAC.1o8MAAC_AAC");
  });
});

describe("bq-datasets env overrides (1o8 Hub cutover)", () => {
  it("BibleApp override → mfhub-501815.MFBibleApp", () => {
    vi.stubEnv("BQ_BIBLEAPP_PROJECT_ID", "mfhub-501815");
    vi.stubEnv("BQ_BIBLEAPP_DATASET", "MFBibleApp");
    vi.stubEnv("BQ_BIBLEAPP_LOCATION", "US");
    expect(bibleAppTable("AAC")).toBe("mfhub-501815.MFBibleApp.AAC");
    expect(bibleAppLocation()).toBe("US");
  });

  it("SEO override → mfhub-501815.MFMSEO with renamed table", () => {
    vi.stubEnv("BQ_SEO_PROJECT_ID", "mfhub-501815");
    vi.stubEnv("BQ_SEO_DATASET", "MFMSEO");
    vi.stubEnv("BQ_SEO_OUTPAPLUS_TABLE", "OUT_PA+");
    expect(seoOutPaPlusTable()).toBe("mfhub-501815.MFMSEO.OUT_PA+");
  });

  it("MAAC override → mfhub-501815.MFMAAC.MFMAAC_AAC", () => {
    vi.stubEnv("BQ_MAAC_PROJECT_ID", "mfhub-501815");
    vi.stubEnv("BQ_MAAC_DATASET", "MFMAAC");
    vi.stubEnv("BQ_MAAC_TABLE", "MFMAAC_AAC");
    expect(maacAacTable()).toBe("mfhub-501815.MFMAAC.MFMAAC_AAC");
    expect(maacDataset()).toBe("MFMAAC");
  });

  it("empty-string env falls back to default (not empty)", () => {
    vi.stubEnv("BQ_MAAC_DATASET", "");
    expect(maacDataset()).toBe("MFAAC");
  });
});
