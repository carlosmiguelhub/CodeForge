import { JavaGuiWorkbench } from "@/components/java-gui-workbench/java-gui-workbench";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default function StudentJavaGuiWorkspacePage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/java-gui-workspace"
        eyebrow="Student workspace"
        pageTitle="Java GUI Workspace"
      >
        <WorkspaceLockGate workspace="java-gui-workspace">
          <JavaGuiWorkbench />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
