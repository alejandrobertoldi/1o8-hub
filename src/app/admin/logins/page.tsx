import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { SharedLogins } from "@/components/admin/shared-logins";

export default async function SharedLoginsPage() {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) redirect("/");
  return <SharedLogins />;
}
