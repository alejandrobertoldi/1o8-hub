import { redirect } from "next/navigation";

// Merged into the Geography page (Thread Z2): inventory is now a view there.
export default function FbaInventoryMapPage() {
  redirect("/reports/order-geography?view=inventory");
}
