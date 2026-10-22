/* eslint-disable react-doctor/async-await-in-loop */
import fs from "node:fs/promises";
import path from "node:path";

const SKILL_ROOT = path.join(process.cwd(), ".claude/skills/1o8-seo-manager");

export type LoadedSkill = {
  name: string;
  description: string;
  body: string;
  phases: Record<"s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" | "s9", string>;
  rubrics: Record<"rufus-coverage" | "cosmo-coverage" | "amazon-compliance" | "byte-budgets", string>;
  schema: { version: number; tables: Record<string, unknown> };
};

let cached: LoadedSkill | null = null;

export async function loadSkill(): Promise<LoadedSkill> {
  if (cached) return cached;

  const skillMd = await fs.readFile(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
  const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error("SKILL.md missing frontmatter");
  const fm = Object.fromEntries(
    fmMatch[1].split("\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
  );

  const phaseFiles = ["s1-intake", "s2-keywords", "s3-reviews", "s4-rufus", "s5-cosmo", "s6-listing-content", "s7-aplus", "s8-images", "s9-score"];
  const phases: Record<string, string> = {};
  for (const f of phaseFiles) {
    phases[f.split("-")[0]] = await fs.readFile(path.join(SKILL_ROOT, "phases", `${f}.md`), "utf8");
  }

  const rubricFiles = ["rufus-coverage", "cosmo-coverage", "amazon-compliance", "byte-budgets"];
  const rubrics: Record<string, string> = {};
  for (const r of rubricFiles) {
    rubrics[r] = await fs.readFile(path.join(SKILL_ROOT, "rubrics", `${r}.md`), "utf8");
  }

  const schema = JSON.parse(await fs.readFile(path.join(SKILL_ROOT, "schema.json"), "utf8"));

  cached = {
    name: fm.name,
    description: fm.description,
    body: fmMatch[2],
    phases: phases as LoadedSkill["phases"],
    rubrics: rubrics as LoadedSkill["rubrics"],
    schema,
  };
  return cached;
}

export function clearSkillCache() {
  cached = null;
}
