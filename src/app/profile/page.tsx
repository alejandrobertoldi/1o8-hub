import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";

/**
 * Server component, not a client redirect: the target depends on the session's
 * user id, and rendering a page only to bounce it client-side would flash.
 *
 * /admin/* is admin-gated, so without this a viewer could never reach a page
 * that lets them fix their own phone number (spec D5).
 */
export default async function ProfilePage() {
  const session = await getAuthSession();
  if (!session) redirect("/auth/signin");
  redirect(`/team/${session.user.id}`);
}
