import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ErdWorkbench } from "@/components/erd-workbench/erd-workbench";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default async function StudentErdDiagramPage({
  params,
}: Readonly<{ params: Promise<{ diagramId: string }> }>) {
  const { diagramId } = await params;
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/erd-workspace"
        eyebrow="Student workspace"
        pageTitle="ERD Workspace"
      >
        <WorkspaceLockGate workspace="erd-editor">
          <ErdWorkbench diagramId={diagramId} />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
