import { JavaGuiWorkbench } from "@/components/java-gui-workbench/java-gui-workbench";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function TeacherJavaGuiWorkspacePage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/java-gui-workspace"
        eyebrow="Teacher workspace"
        pageTitle="Java GUI Workspace"
      >
        <JavaGuiWorkbench />
      </AppShell>
    </ProtectedRolePage>
  );
}
