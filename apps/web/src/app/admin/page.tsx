import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { FoundationDashboard } from "@/components/foundation-dashboard";

export default function AdministratorPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin"
        eyebrow="Administrator workspace"
        pageTitle="Dashboard"
      >
        <FoundationDashboard />
      </AppShell>
    </ProtectedRolePage>
  );
}
