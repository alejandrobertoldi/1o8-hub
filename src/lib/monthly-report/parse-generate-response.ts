/** Parse POST /api/reports/monthly when Vercel may return HTML/plain text instead of JSON. */
export function parseGenerateHttpBody(
  status: number,
  text: string,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const timeout = status === 504 || /timed out after \d+ seconds/i.test(text);
  if (timeout) {
    return { ok: false, error: "Timed out generating the PDF. Retry once. The first run is slower." };
  }

  try {
    const body = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (status >= 400) {
      const err = typeof body.error === "string" && body.error ? body.error : `HTTP ${status}`;
      return { ok: false, error: err };
    }
    return { ok: true, body };
  } catch {
    if (/^an error/i.test(text.trim())) {
      return { ok: false, error: "Server error while generating the PDF. Retry once." };
    }
    return { ok: false, error: text.replace(/\s+/g, " ").slice(0, 160) || `HTTP ${status}` };
  }
}
