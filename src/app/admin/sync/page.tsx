import { redirect } from "next/navigation";

/**
 * 1o8 (2026-11-05): the old Data Sync (BigQuery → hub pull of AAC clients
 * and product attributes) is superseded by Sync & Export, whose AAC sheet
 * sync is the source of truth; pulling stale BigQuery rows could overwrite
 * hub edits. Old links land on Sync & Export. The API route stays.
 */
export default function DataSyncPage() {
  redirect("/publish");
}
