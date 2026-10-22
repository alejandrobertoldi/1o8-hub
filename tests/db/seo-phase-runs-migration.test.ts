// tests/db/seo-phase-runs-migration.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

describe("0060 seo_phase_runs migration", () => {
  it("creates seo_phase_runs table with expected columns", async () => {
    const cols = await db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'seo_phase_runs'
      ORDER BY ordinal_position
    `);
    const names = cols.map((c) => c.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id", "project_id", "phase", "status", "trigger", "attempt",
        "parent_run_id", "started_at", "finished_at", "duration_ms",
        "claude_input_tokens", "claude_output_tokens", "claude_cost_usd",
        "claude_model", "output_artifact_version", "validation_errors",
        "error_message", "triggered_by", "created_at",
      ])
    );
  });

  it("has the in-flight status index", async () => {
    const idx = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'seo_phase_runs'
        AND indexname = 'idx_seo_phase_runs_status'
    `);
    expect(idx.length).toBe(1);
  });
});
