import { redirect } from "next/navigation";

// Web section entry point → the launch calendar (its only page for now).
export default function WebPage() {
  redirect("/web/launches");
}
