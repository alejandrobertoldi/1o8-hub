import { redirect } from "next/navigation";

// Retired: inventory lives in its own section now; keep the client preselected.
export default async function RetiredClientInventoryPage({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  const { clientIdCode } = await params;
  redirect(`/inventory?client=${encodeURIComponent(clientIdCode)}`);
}
