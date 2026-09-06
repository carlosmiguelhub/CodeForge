import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WebWorkbench } from "@/components/web-workbench/web-workbench";

export default function TeacherWebWorkspacePage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/web-workspace"
        eyebrow="Teacher workspace"
        pageTitle="Web Workspace"
      >
        <WebWorkbench />
      </AppShell>
    </ProtectedRolePage>
  );
}
