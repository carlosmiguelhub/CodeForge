import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WorkspaceList } from "@/components/workspace/workspace-list";

export default function TeacherWorkspacesPage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/workspaces"
        eyebrow="Teacher workspace"
        pageTitle="SQL Workspace"
      >
        <WorkspaceList role="teacher" />
      </AppShell>
    </ProtectedRolePage>
  );
}
