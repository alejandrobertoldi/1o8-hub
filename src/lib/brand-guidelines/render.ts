/* eslint-disable react-doctor/server-sequential-independent-await */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientBrandGuidelines,
  clientBrandGuidelineVersions,
  clientBrandGuidelineNotes,
} from "@/lib/db/schema";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

/**
 * Pure server-side function. Renders a markdown document from DB rows
 * for a single client. Consumed by:
 *   • GET /api/clients/[idCode]/brand-guidelines/md (HTTP)
 *   • SEO project create handler (server-side import)
 *   • Future in-app AI agents (server-side import)
 *
 * Returns "" when there's no row or no active version. Callers treat
 * "" as "no brand guidelines uploaded".
 */
export async function renderBrandGuidelinesMd(clientIdCode: string): Promise<string> {
  const [bg] = await db.select().from(clientBrandGuidelines)
    .where(eq(clientBrandGuidelines.clientIdCode, clientIdCode))
    .limit(1);
  if (!bg || !bg.activeVersionId) return "";

  const [activeVersion] = await db.select().from(clientBrandGuidelineVersions)
    .where(eq(clientBrandGuidelineVersions.id, bg.activeVersionId))
    .limit(1);

  const notes = await db.select().from(clientBrandGuidelineNotes)
    .where(and(
      eq(clientBrandGuidelineNotes.clientIdCode, clientIdCode),
      isNull(clientBrandGuidelineNotes.deletedAt),
    ))
    .orderBy(asc(clientBrandGuidelineNotes.createdAt));

  const lines: string[] = [];
  lines.push(`# Brand Guidelines — ${clientIdCode}`);
  lines.push("");
  lines.push(`> Last regenerated: ${new Date().toISOString()}`);
  if (activeVersion) {
    lines.push(`> Active brand book: v${activeVersion.versionNumber} — ${activeVersion.originalFilename} (uploaded ${fmtDate(activeVersion.uploadedAt as Date)} by ${activeVersion.uploadedBy})`);
  }
  lines.push("");

  // Summary — Logo
  lines.push("## Summary");
  lines.push("");
  lines.push("### Logo");
  const logo = bg.summaryLogo ?? null;
  if (logo) {
    const descs = [logo.primary_description, logo.secondary_description, logo.monochrome_description].filter(Boolean);
    if (descs.length) lines.push(descs.join(", "));
    if (logo.clearspace_notes) lines.push(`**Clearspace:** ${logo.clearspace_notes}`);
    if (logo.misuse_notes) lines.push(`**Misuse:** ${logo.misuse_notes}`);
    const filesLine = [
      logo.primary_url && `primary=${logo.primary_url}`,
      logo.secondary_url && `secondary=${logo.secondary_url}`,
      logo.monochrome_url && `monochrome=${logo.monochrome_url}`,
    ].filter(Boolean).join(", ");
    if (filesLine) lines.push(`**Files:** ${filesLine}`);
  }
  lines.push("");

  // Summary — Colors
  lines.push("### Colors");
  const colors = bg.summaryColors ?? [];
  if (colors.length) {
    lines.push("| Role | Name | Hex | RGB | CMYK |");
    lines.push("|------|------|-----|-----|------|");
    for (const c of colors) {
      lines.push(`| ${c.role} | ${c.name} | ${c.hex} | ${c.rgb ?? ""} | ${c.cmyk ?? ""} |`);
    }
  }
  lines.push("");

  // Summary — Typography
  lines.push("### Typography");
  const typo = bg.summaryTypography ?? { primary: null, secondary: null };
  if (typo.primary) {
    lines.push(`- **Primary:** ${typo.primary.family}, weights ${typo.primary.weights.join("/")}, fallback ${typo.primary.fallback ?? "—"}`);
  }
  if (typo.secondary) {
    lines.push(`- **Secondary:** ${typo.secondary.family}, weights ${typo.secondary.weights.join("/")}, fallback ${typo.secondary.fallback ?? "—"}`);
  }
  lines.push("");

  // Summary — Voice
  lines.push("### Brand voice & tone");
  const voice = bg.summaryVoice ?? { attributes: [], dos: [], donts: [], sample_copy: null };
  if (voice.attributes.length) lines.push(`**Attributes:** ${voice.attributes.join(", ")}`);
  if (voice.dos.length) {
    lines.push("**Do:**");
    for (const d of voice.dos) lines.push(`- ${d}`);
  }
  if (voice.donts.length) {
    lines.push("**Don't:**");
    for (const d of voice.donts) lines.push(`- ${d}`);
  }
  if (voice.sample_copy) lines.push(`**Sample copy:** ${voice.sample_copy}`);
  lines.push("");

  // Full extracted brand book
  if (activeVersion?.extractedMd) {
    lines.push(`## Full extracted brand book (v${activeVersion.versionNumber})`);
    lines.push("");
    lines.push(activeVersion.extractedMd);
    lines.push("");
  }

  // Notes timeline
  if (notes.length) {
    lines.push("## Other guidelines (chronological)");
    lines.push("");
    for (const n of notes) {
      lines.push(`### ${fmtDate(n.createdAt as Date)} — ${n.authorEmail}`);
      lines.push("");
      lines.push(n.bodyMd);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
