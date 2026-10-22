import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { seoRevisions, seoRevisionEvents, seoRevisionComments, seoRevisionPushes } from "./schema";

const cols = (t: Parameters<typeof getTableConfig>[0]) => getTableConfig(t).columns.map((c) => c.name).sort();

describe("seo revision tables", () => {
  it("seo_revisions has the frozen-content and approval columns", () => {
    expect(getTableConfig(seoRevisions).name).toBe("seo_revisions");
    expect(cols(seoRevisions)).toEqual([
      "approved_at", "content", "created_at", "final_reason", "final_via", "id", "is_current",
      "project_id", "revision_number", "status", "submitted_at", "submitted_by_email",
      "submitted_by_name", "updated_at",
    ]);
  });
  it("one open revision and one current revision per project are unique indexes", () => {
    const idx = getTableConfig(seoRevisions).indexes.map((i) => i.config.name).sort();
    expect(idx).toEqual(["uq_seo_revisions_one_current", "uq_seo_revisions_one_open", "uq_seo_revisions_project_number"]);
  });
  it("events, comments, pushes have their columns", () => {
    expect(cols(seoRevisionEvents)).toEqual(["acted_as", "action", "actor_email", "actor_name", "created_at", "id", "note", "revision_id", "step"]);
    expect(cols(seoRevisionComments)).toEqual([
      "asin", "audience", "author_email", "author_name", "body", "created_at", "field_key", "id",
      "parent_comment_id", "resolved_at", "resolved_by", "revision_id", "updated_at",
    ]);
    expect(cols(seoRevisionPushes)).toEqual(["created_at", "id", "override_reason", "product_id", "project_id", "pushed_by", "revision_id"]);
  });
  it("a push row goes with its revision (CASCADE, never SET NULL against the source CHECK)", () => {
    const fk = getTableConfig(seoRevisionPushes).foreignKeys.find((f) => f.reference().foreignColumns[0].name === "id" && f.reference().foreignTable === seoRevisions);
    expect(fk?.onDelete).toBe("cascade");
  });
});
