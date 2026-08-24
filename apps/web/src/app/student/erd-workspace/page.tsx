import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ErdDiagramList } from "@/components/erd-workbench/erd-diagram-list";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default function StudentErdWorkspacePage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/erd-workspace"
        eyebrow="Student workspace"
        pageTitle="ERD Workspace"
      >
        <WorkspaceLockGate workspace="erd-editor">
          <ErdDiagramList role="student" />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
