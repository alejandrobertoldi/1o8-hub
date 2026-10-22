// UTF-8 byte counting + per-field budget checks for the SEO pipeline.

const enc = new TextEncoder();

export function utf8ByteLength(s: string): number {
  return enc.encode(s).length;
}

export function checkByteBudget(
  s: string,
  maxBytes: number
): { used: number; max: number; ok: boolean } {
  const used = utf8ByteLength(s);
  return { used, max: maxBytes, ok: used <= maxBytes };
}

export function checkCharBudget(
  s: string,
  minChars: number,
  maxChars: number
): { used: number; min: number; max: number; ok: boolean } {
  const used = [...s].length; // grapheme-friendly char count
  return { used, min: minChars, max: maxChars, ok: used >= minChars && used <= maxChars };
}
