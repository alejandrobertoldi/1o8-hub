import { redirect } from "next/navigation";

/** Moved to Sync & Export → AAC Sheet. */
export default function AacSyncPage() {
  redirect("/publish?tab=aac");
}
