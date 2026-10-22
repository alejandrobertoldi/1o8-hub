import { promises as fs } from "node:fs";
import path from "node:path";

const HELP_CONTENT_DIR = path.join(process.cwd(), "src", "content", "help");

/** Reads a help guide HTML fragment by slug. Returns null if missing or the slug is unsafe. */
export async function loadGuideHtml(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null; // traversal / injection guard
  try {
    return await fs.readFile(path.join(HELP_CONTENT_DIR, `${slug}.html`), "utf8");
  } catch {
    return null;
  }
}
