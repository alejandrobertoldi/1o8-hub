import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-db";
import { canUseNewBusiness } from "@/lib/new-business";
import { PipelineBoard } from "@/components/new-business/pipeline-board";

export default async function NewBusinessPage() {
  const session = await getAuthSession();
  if (!session || !canUseNewBusiness(session.user.role, session.user.allowedSections)) redirect("/");
  return <PipelineBoard />;
}
