import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { FoundationDashboard } from "@/components/foundation-dashboard";

export default function TeacherPage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher"
        eyebrow="Teacher workspace"
        pageTitle="Dashboard"
      >
        <FoundationDashboard />
      </AppShell>
    </ProtectedRolePage>
  );
}
