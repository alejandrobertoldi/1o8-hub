import ProjectShell from "@/components/seo/project-shell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectShell projectId={id}>{children}</ProjectShell>;
}
