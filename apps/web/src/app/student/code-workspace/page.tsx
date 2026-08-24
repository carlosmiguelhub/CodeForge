import { CodeWorkbench } from "@/components/code-workbench/code-workbench";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default function StudentCodeWorkspacePage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/code-workspace"
        eyebrow="Student workspace"
        pageTitle="Code Workspace"
      >
        <WorkspaceLockGate workspace="code-compiler">
          <CodeWorkbench />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
