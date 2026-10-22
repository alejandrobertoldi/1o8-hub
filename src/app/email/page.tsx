import { redirect } from "next/navigation";

// Email section entry point → the send-dates calendar (its only page for now).
export default function EmailPage() {
  redirect("/email/send-dates");
}
