import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ErdWorkbench } from "@/components/erd-workbench/erd-workbench";

export default async function TeacherErdDiagramPage({
  params,
}: Readonly<{ params: Promise<{ diagramId: string }> }>) {
  const { diagramId } = await params;
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/erd-workspace"
        eyebrow="Teacher workspace"
        pageTitle="ERD Workspace"
      >
        <ErdWorkbench diagramId={diagramId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
