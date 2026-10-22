import { redirect } from "next/navigation";

export const metadata = { title: "Export | 1o8 Hub" };

export default function ExportPage() {
  redirect("/publish");
}
