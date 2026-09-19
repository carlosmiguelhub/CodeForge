import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { TeacherDashboard } from "@/components/teacher-dashboard";

export default function TeacherPage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher"
        eyebrow="Teacher workspace"
        pageTitle="Dashboard"
      >
        <TeacherDashboard />
      </AppShell>
    </ProtectedRolePage>
  );
}
