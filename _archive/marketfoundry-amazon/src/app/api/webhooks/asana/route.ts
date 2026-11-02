import { NextRequest, NextResponse } from "next/server";
import { processWebhookEvents } from "@/lib/asana-sync";

/**
 * Asana Webhook Receiver
 *
 * Handles two scenarios:
 * 1. Handshake: Asana sends a POST with X-Hook-Secret header.
 *    We must echo it back to confirm the webhook.
 * 2. Events: Asana sends POST with event payload.
 *    We process task changes and sync to Gantt.
 *
 * Asana webhooks: https://developers.asana.com/docs/webhooks-guide
 */
export async function POST(req: NextRequest) {
  // 1. Handshake — Asana sends X-Hook-Secret on initial registration
  const hookSecret = req.headers.get("x-hook-secret");
  if (hookSecret) {
    return new NextResponse(null, {
      status: 200,
      headers: { "X-Hook-Secret": hookSecret },
    });
  }

  // 2. Verify signature (optional but recommended)
  // Asana sends X-Hook-Signature — HMAC-SHA256 of body with the secret
  // For now we process all events; add signature verification when webhook secret is stored

  try {
    const body = await req.json();
    const events = body.events;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ ok: true });
    }

    // Process events asynchronously — respond quickly to Asana
    // (Asana requires response within 10 seconds)
    const result = await processWebhookEvents(events);

    if (result.errors.length > 0) {
      console.error("[AsanaWebhook] Errors:", result.errors);
    }

    return NextResponse.json({
      ok: true,
      processed: result.processed,
    });
  } catch (err) {
    console.error("[AsanaWebhook] Error:", err);
    // Return 200 to avoid Asana retrying
    return NextResponse.json({ ok: false, error: "Processing error" });
  }
}
