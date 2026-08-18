import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WorkspaceList } from "@/components/workspace/workspace-list";

export default function StudentWorkspacesPage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/workspaces"
        eyebrow="Student workspace"
        pageTitle="SQL Workspace"
      >
        <WorkspaceList role="student" />
      </AppShell>
    </ProtectedRolePage>
  );
}
