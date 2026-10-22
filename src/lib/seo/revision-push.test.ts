import { describe, it, expect } from "vitest";
import { buildPushUpdate, findDrift } from "./revision-push";
import { overlayProduct } from "./revision-fields";

const product = { itemName: "Old", itemHighlight: null, genericKeywords: null, contentSeo: { DetailedBulletPoint1: "old" }, rawColumnValues: {}, changeLog: [] };
const fields = { Title: "New", DetailedBulletPoint_1: "new b1", BackendSearchTerms: "kw" };

describe("buildPushUpdate", () => {
  it("PREVIEW = PUSH: the pushed values equal the preview overlay for every key", () => {
    const { updates } = buildPushUpdate(product, fields, "a@x.com", "2026-10-04T10:00:00.000Z");
    const preview = overlayProduct(product, fields);
    expect(updates.itemName).toBe(preview.itemName);
    expect(updates.genericKeywords).toBe(preview.genericKeywords);
    expect(updates.contentSeo).toEqual(preview.contentSeo);
  });
  it("marks dirty, logs only changed fields, mirrors raw values", () => {
    const { updates, fieldsChanged } = buildPushUpdate(product, { ...fields, DetailedBulletPoint_1: "old" }, "a@x.com", "2026-10-04T10:00:00.000Z");
    expect(updates.isDirty).toBe(true);
    expect(fieldsChanged).toBe(3);
    const log = updates.changeLog as Array<{ field: string; newValue: string }>;
    expect(log.map((e) => e.field)).toEqual(["ItemName", "GenericKeyword1"]);
    expect((updates.rawColumnValues as Record<string, string>).ItemName).toBe("New");
  });
});

describe("findDrift (Review Focus 5)", () => {
  it("flags mapped fields edited in the catalog after approval, ignores older or unrelated edits", () => {
    const changeLog = [
      { field: "ItemName", changedAt: "2026-10-05T09:00:00.000Z", changedBy: "cat@x.com" },
      { field: "DetailedBulletPoint1", changedAt: "2026-10-01T09:00:00.000Z", changedBy: "cat@x.com" },
      { field: "Color", changedAt: "2026-10-06T09:00:00.000Z", changedBy: "cat@x.com" },
    ];
    expect(findDrift(changeLog, fields, "2026-10-04T00:00:00.000Z")).toEqual([
      { key: "Title", changedAt: "2026-10-05T09:00:00.000Z", changedBy: "cat@x.com" },
    ]);
  });
  it("catches catalog edits logged under the column-registry name (GenericKeywords)", () => {
    const changeLog = [{ field: "GenericKeywords", changedAt: "2026-10-05T09:00:00.000Z", changedBy: "cat@x.com" }];
    expect(findDrift(changeLog, { BackendSearchTerms: "kw" }, "2026-10-04T00:00:00.000Z")).toEqual([
      { key: "BackendSearchTerms", changedAt: "2026-10-05T09:00:00.000Z", changedBy: "cat@x.com" },
    ]);
  });
  it("tolerates a missing or malformed changeLog", () => {
    expect(findDrift(null, fields, "2026-10-04T00:00:00.000Z")).toEqual([]);
  });
  it("a previous push of the same text is not drift; a later catalog edit is", () => {
    const pushed = [{ field: "ItemName", newValue: "New", changedAt: "2026-10-05T00:00:00.000Z", changedBy: "sam@x.com" }];
    expect(findDrift(pushed, { Title: "New" }, "2026-10-04T00:00:00.000Z")).toEqual([]);
    const thenEdited = [...pushed, { field: "ItemName", newValue: "Edited", changedAt: "2026-10-06T00:00:00.000Z", changedBy: "cat@x.com" }];
    expect(findDrift(thenEdited, { Title: "New" }, "2026-10-04T00:00:00.000Z")).toEqual([{ key: "Title", changedAt: "2026-10-06T00:00:00.000Z", changedBy: "cat@x.com" }]);
  });
});
