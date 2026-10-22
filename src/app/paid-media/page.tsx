import { redirect } from "next/navigation";

// Paid Media section entry point → the campaign calendar (its only page for now).
export default function PaidMediaPage() {
  redirect("/paid-media/campaigns");
}
