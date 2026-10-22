import { redirect } from "next/navigation";

// "Client Settings" tab entry point: opens the first settings page.
export default async function ClientSettingsPage({ params }: { params: Promise<{ clientIdCode: string }> }) {
  const { clientIdCode } = await params;
  redirect(`/clients/${encodeURIComponent(clientIdCode)}/web-social`);
}
