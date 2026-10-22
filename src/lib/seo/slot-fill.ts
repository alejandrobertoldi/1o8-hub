// Replace {{slot_name}} placeholders in a phase template with values
// from a context object. Objects/arrays are JSON-stringified.
// Missing slots throw — a silent empty fill would corrupt the prompt.

export type SlotMap = Record<string, unknown>;

export function substituteSlots(template: string, slots: SlotMap): string {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_full, name: string) => {
    if (!(name in slots)) throw new Error(`missing slot in template: ${name}`);
    const v = slots[name];
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  });
}
