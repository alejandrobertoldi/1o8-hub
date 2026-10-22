"use client";
import { useParams } from "next/navigation";
import { Aplus2ClientSetsView } from "./_components/aplus2-client-sets-view";

export default function Aplus2ClientSetsPage() {
  const params = useParams();
  const clientIdCode = typeof params.clientIdCode === "string" ? params.clientIdCode : "";
  return (
    <Aplus2ClientSetsView
      clientIdCode={clientIdCode}
      mode="hub"
      backHref="/design/aplus2"
      backLabel="Back to A+ Content v2"
    />
  );
}
