import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WorkspaceList } from "@/components/workspace/workspace-list";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default function StudentWorkspacesPage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/workspaces"
        eyebrow="Student workspace"
        pageTitle="SQL Workspace"
      >
        <WorkspaceLockGate workspace="sql-workbench">
          <WorkspaceList role="student" />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
