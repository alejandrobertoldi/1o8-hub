import { after } from "next/server";
import { aacSheetConfigured } from "./google";
import { syncAac } from "./sync";

/**
 * After a client edit is saved in the hub, push that client to the AAC sheet.
 * Runs with after() so the save responds first; a failure is only logged —
 * the daily sync (and the next edit) retries, since the hub moved and the
 * sheet didn't.
 */
export function queueAacSheetPush(clientIdCode: string): void {
  if (!aacSheetConfigured()) return;
  after(async () => {
    try {
      await syncAac({ trigger: "hub-edit", codes: [clientIdCode] });
    } catch (err) {
      console.error(`[aac-sync] push of ${clientIdCode} to the sheet failed:`, err);
    }
  });
}
