import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";

export default function StudentPage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student"
        eyebrow="Student workspace"
        pageTitle="Dashboard"
      >
        <StudentDashboard />
      </AppShell>
    </ProtectedRolePage>
  );
}
