import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ErdDiagramList } from "@/components/erd-workbench/erd-diagram-list";

export default function TeacherErdWorkspacePage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/erd-workspace"
        eyebrow="Teacher workspace"
        pageTitle="ERD Workspace"
      >
        <ErdDiagramList role="teacher" />
      </AppShell>
    </ProtectedRolePage>
  );
}
