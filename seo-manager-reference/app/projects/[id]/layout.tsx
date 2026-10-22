import ProjectShell from "@/components/project-shell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <ProjectShell projectId={params.id}>
      {children}
    </ProjectShell>
  );
}
