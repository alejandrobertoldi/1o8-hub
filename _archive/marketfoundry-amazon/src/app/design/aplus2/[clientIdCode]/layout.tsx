import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";

export default async function Aplus2ClientScopeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientIdCode: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  const { clientIdCode } = await params;
  if (session.user.role === "client" && session.user.clientIdCode !== clientIdCode) {
    redirect("/design/aplus2");
  }
  return <>{children}</>;
}
