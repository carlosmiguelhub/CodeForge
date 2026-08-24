import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function AdministratorPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin"
        eyebrow="Administrator workspace"
        pageTitle="Dashboard"
      >
        <AdminDashboard />
      </AppShell>
    </ProtectedRolePage>
  );
}
