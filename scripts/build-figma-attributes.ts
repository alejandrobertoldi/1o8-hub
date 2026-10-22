import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";

const wb = XLSX.readFile(resolve(__dirname, "../docs/attributes-export.xlsx"));
const sheet = wb.Sheets["Definitive"];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

// Filter: keep KEEP + null (default) rows; skip rows explicitly removed
const kept = rows.filter(r => {
  const a = r.ACTION;
  return a === "KEEP" || a === "NEW" || a === "edit" || a === null || a === undefined;
});

// Group: card_name -> subcard_name -> attributes[]
const cards = new Map<string, { order: number; subs: Map<string, string[]> }>();
for (const r of kept) {
  const card = String(r["card name"] ?? "(no card)");
  const sub = r["subcard name"] ? String(r["subcard name"]) : "(no subcard)";
  const attr = String(r["general_label"] ?? r["hub_label"] ?? "?");
  const order = Number(r["card order"] ?? 999);

  if (!cards.has(card)) cards.set(card, { order, subs: new Map() });
  const c = cards.get(card)!;
  if (order < c.order) c.order = order;
  if (!c.subs.has(sub)) c.subs.set(sub, []);
  c.subs.get(sub)!.push(attr);
}

const sortedCards = Array.from(cards.entries()).toSorted((a, b) => a[1].order - b[1].order);

// 1. CSV — flat structure: card_name, subcard_name, attribute
const csvRows: string[] = ["card_name,subcard_name,attribute"];
for (const [card, c] of sortedCards) {
  for (const [sub, attrs] of c.subs) {
    for (const attr of attrs) {
      const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      csvRows.push(`${esc(card)},${esc(sub)},${esc(attr)}`);
    }
  }
}
writeFileSync(resolve(__dirname, "../docs/figma-attributes.csv"), csvRows.join("\n"));

// 2. Mermaid — flowchart TD with subgraphs per card, subcards inside, attrs as nodes
const mLines: string[] = ["flowchart TD"];
let nodeId = 0;
const id = () => `n${nodeId++}`;
for (const [card, c] of sortedCards) {
  const cardId = id();
  mLines.push(`  subgraph ${cardId}["${card.replace(/"/g, "'")}"]`);
  for (const [sub, attrs] of c.subs) {
    const subId = id();
    const subLabel = sub === "(no subcard)" ? card : sub;
    mLines.push(`    subgraph ${subId}["${subLabel.replace(/"/g, "'")}"]`);
    for (const attr of attrs) {
      const aId = id();
      mLines.push(`      ${aId}["${attr.replace(/"/g, "'")}"]`);
    }
    mLines.push(`    end`);
  }
  mLines.push(`  end`);
}
writeFileSync(resolve(__dirname, "../docs/figma-attributes-mermaid.txt"), mLines.join("\n"));

// 3. Markdown — for human reading / paste into a sticky
const mdLines: string[] = ["# Attributes (grouped from Definitive tab)\n"];
for (const [card, c] of sortedCards) {
  mdLines.push(`## ${card}`);
  for (const [sub, attrs] of c.subs) {
    if (sub !== "(no subcard)") mdLines.push(`\n### ${sub}`);
    for (const attr of attrs) mdLines.push(`- ${attr}`);
  }
  mdLines.push("");
}
writeFileSync(resolve(__dirname, "../docs/figma-attributes.md"), mdLines.join("\n"));

console.log(`Cards: ${sortedCards.length}`);
console.log(`Total subcards: ${sortedCards.reduce((s, [, c]) => s + c.subs.size, 0)}`);
console.log(`Total attributes: ${sortedCards.reduce((s, [, c]) => s + [...c.subs.values()].flat().length, 0)}`);
console.log("Wrote: docs/figma-attributes.csv, docs/figma-attributes-mermaid.txt, docs/figma-attributes.md");
