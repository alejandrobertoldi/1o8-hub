// Helpers for the S4 "map_answers" action: Claude maps a pasted Alexa for
// Shopping chat export onto the questions that were asked. These keep the
// result the right length and shape whatever the model returns.

/** First JSON array in a model reply (tolerates fences, prose, or {answers: [...]}). */
export function extractJsonArray(text: string): unknown[] | null {
  const clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const whole = tryParse(clean);
  if (Array.isArray(whole)) return whole;
  if (whole && typeof whole === "object" && Array.isArray((whole as { answers?: unknown }).answers)) {
    return (whole as { answers: unknown[] }).answers;
  }
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const slice = tryParse(clean.slice(start, end + 1));
    if (Array.isArray(slice)) return slice;
  }
  return null;
}

/** Exactly `count` answer strings, in question order ("" = not answered). */
export function coerceMappedAnswers(parsed: unknown, count: number): string[] {
  const arr = Array.isArray(parsed) ? parsed : [];
  return Array.from({ length: count }, (_, i) => {
    const v = arr[i];
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    if (v && typeof v === "object" && typeof (v as { answer?: unknown }).answer === "string") {
      return ((v as { answer: string }).answer).trim();
    }
    return "";
  });
}
