import { redirect } from "next/navigation";

// Inventory moved to its own section; keep old links and bookmarks working (and their ?client=).
export default async function OldInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  redirect(client ? `/inventory?client=${encodeURIComponent(client)}` : "/inventory");
}
