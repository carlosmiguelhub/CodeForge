import { CodeWorkbench } from "@/components/code-workbench/code-workbench";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function TeacherCodeWorkspacePage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/code-workspace"
        eyebrow="Teacher workspace"
        pageTitle="Code Workspace"
      >
        <CodeWorkbench />
      </AppShell>
    </ProtectedRolePage>
  );
}
