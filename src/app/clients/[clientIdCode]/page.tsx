import { ClientDetail } from "@/components/clients/client-detail";
import { ClientOverviewMeta } from "./page-meta";

export const metadata = { title: "Client | 1o8 Hub" };

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  const { clientIdCode } = await params;

  return (
    <>
      <ClientOverviewMeta />
      <ClientDetail clientIdCode={clientIdCode} />
    </>
  );
}
