/* eslint-disable react-doctor/async-await-in-loop */
import { db } from "@/lib/db";
import { seoPhaseRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loadSkill } from "@/lib/seo/skill-loader";
import { callClaudeJson } from "@/lib/seo/claude-client";
import { getValidator } from "@/lib/seo/validators";
import { substituteSlots } from "@/lib/seo/slot-fill";
import { S1 } from "@/lib/seo/phases/s1";
import { S2 } from "@/lib/seo/phases/s2";
import { S3 } from "@/lib/seo/phases/s3";
import { S4 } from "@/lib/seo/phases/s4";
import { S5 } from "@/lib/seo/phases/s5";
import { S6 } from "@/lib/seo/phases/s6";
import { S7 } from "@/lib/seo/phases/s7";
import { S8 } from "@/lib/seo/phases/s8";
import { S9 } from "@/lib/seo/phases/s9";
import type { PhaseExecutor, PhaseId } from "@/lib/seo/phases/s1";

export type { PhaseId };

export type PhaseRunResult =
  | { status: "success"; runId: string; version: number }
  | { status: "validation_failed"; runId: string; errors: Array<{ field: string; message: string }> }
  | { status: "error"; runId: string; message: string }
  | { status: "paused_user_input"; runId: string };

type RunOpts = {
  trigger: "manual" | "auto_run" | "cascade_rerun" | "s9_auto_rerun";
  triggeredBy?: string;
  parentRunId?: string;
};

export async function runPhase(
  projectId: string,
  phase: PhaseId,
  opts: RunOpts = { trigger: "manual" }
): Promise<PhaseRunResult> {
  const [runRow] = await db
    .insert(seoPhaseRuns)
    .values({
      projectId,
      phase,
      status: "running",
      trigger: opts.trigger,
      attempt: 1,
      parentRunId: opts.parentRunId,
      triggeredBy: opts.triggeredBy,
    })
    .returning();
  const runId = runRow.id;
  const startedAt = Date.now();

  try {
    // S4P1 + S4P2 are paste-back gates: no Claude call, just flip to paused.
    if (phase === "S4P1" || phase === "S4P2") {
      await db.update(seoPhaseRuns).set({ status: "paused_user_input" }).where(eq(seoPhaseRuns.id, runId));
      return { status: "paused_user_input", runId };
    }

    const executor = pickExecutor(phase);
    const skill = await loadSkill();
    const ctx = await executor.loadContext(projectId);
    const slots = executor.fillSlots(ctx);
    const phaseKey = phaseKeyFor(phase);
    const template = skill.phases[phaseKey];
    const userPrompt = substituteSlots(template, slots);
    const systemPrompt = `${skill.body}\n\nReturn ONLY a JSON object that matches the phase output schema. Do not include prose, markdown, or commentary.`;

    let parsed: unknown;
    let usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
    let model: string = executor.model;
    let costUsd = 0;
    let attempt = 1;
    let validationErrors: Array<{ field: string; message: string }> = [];

    const validator = await getValidator(phase);

    for (attempt = 1; attempt <= 2; attempt++) {
      const r = await callClaudeJson({
        systemPromptCached: systemPrompt,
        userPrompt: attempt === 1 ? userPrompt : `${userPrompt}\n\nPRIOR VALIDATION ERRORS — please fix:\n${JSON.stringify(validationErrors)}`,
        model: executor.model,
        maxTokens: 8192,
      });
      parsed = r.parsed;
      usage = r.usage;
      model = r.model;
      costUsd += r.costUsd;

      const v = validator.safeParse(parsed);
      if (v.success) {
        validationErrors = [];
        break;
      }
      validationErrors = v.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
      await db.update(seoPhaseRuns).set({ attempt }).where(eq(seoPhaseRuns.id, runId));
    }

    if (validationErrors.length > 0) {
      await db
        .update(seoPhaseRuns)
        .set({
          status: "validation_failed",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          claudeInputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
          claudeOutputTokens: usage.output_tokens,
          claudeCostUsd: costUsd.toFixed(4),
          claudeModel: model,
          validationErrors,
        })
        .where(eq(seoPhaseRuns.id, runId));
      return { status: "validation_failed", runId, errors: validationErrors };
    }

    const { version } = await executor.persist(projectId, parsed as never, runId);

    await db
      .update(seoPhaseRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        claudeInputTokens: usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens,
        claudeOutputTokens: usage.output_tokens,
        claudeCostUsd: costUsd.toFixed(4),
        claudeModel: model,
        outputArtifactVersion: version,
      })
      .where(eq(seoPhaseRuns.id, runId));

    return { status: "success", runId, version };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(seoPhaseRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        errorMessage: message,
      })
      .where(eq(seoPhaseRuns.id, runId));
    return { status: "error", runId, message };
  }
}

function pickExecutor(phase: PhaseId): PhaseExecutor<unknown, unknown> {
  switch (phase) {
    case "S1": return S1 as PhaseExecutor<unknown, unknown>;
    case "S2": return S2 as PhaseExecutor<unknown, unknown>;
    case "S3": return S3 as PhaseExecutor<unknown, unknown>;
    case "S4P3":
      // S4P3 is autonomous: Claude generates optimization-synthesis from the canonical
      // questions + phase-2 paste-backs. Full executor lands in Milestone G when S4 is
      // refactored to a real PhaseExecutor. For §D we reuse S5's loadContext/fillSlots
      // shape and route persist through S4.persistPhase3.
      // NOTE: S4P3 is NOT exercised by any §D test; the runner test only checks the
      // function shape, and the e2e test only runs S1.
      return {
        ...(S5 as PhaseExecutor<unknown, unknown>),
        phase: "S4P3",
        persist: async (pid: string, out: unknown) => {
          await S4.persistPhase3(pid, out as Parameters<typeof S4.persistPhase3>[1]);
          return { version: 1 };
        },
      } as PhaseExecutor<unknown, unknown>;
    case "S5": return S5 as PhaseExecutor<unknown, unknown>;
    case "S6": return S6 as PhaseExecutor<unknown, unknown>;
    case "S7": return S7;
    case "S8": return S8;
    case "S9": return S9;
    default: throw new Error(`no executor for phase: ${phase}`);
  }
}

function phaseKeyFor(phase: PhaseId): "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "s9" {
  if (phase.startsWith("S4")) return "s4";
  return phase.toLowerCase().slice(0, 2) as "s1" | "s2" | "s3" | "s5" | "s6" | "s7" | "s8" | "s9";
}

export async function runProject(
  projectId: string,
  opts: RunOpts = { trigger: "auto_run" }
): Promise<PhaseRunResult[]> {
  const order: PhaseId[] = ["S1", "S2", "S3", "S4P1", "S4P2", "S4P3", "S5", "S6", "S7", "S8", "S9"];
  const results: PhaseRunResult[] = [];
  for (const p of order) {
    const r = await runPhase(projectId, p, opts);
    results.push(r);
    if (r.status !== "success") return results; // halt on pause / fail / error
  }
  return results;
}
