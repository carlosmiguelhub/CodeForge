import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WebWorkbench } from "@/components/web-workbench/web-workbench";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default function StudentWebWorkspacePage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/web-workspace"
        eyebrow="Student workspace"
        pageTitle="Web Workspace"
      >
        <WorkspaceLockGate workspace="web-workspace">
          <WebWorkbench />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
