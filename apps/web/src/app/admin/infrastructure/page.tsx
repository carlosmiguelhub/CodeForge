import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { InfrastructureView } from "@/components/admin/infrastructure-view";

export default function DatabaseInfrastructurePage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin/infrastructure"
        eyebrow="Administrator workspace"
        pageTitle="Database Infrastructure"
      >
        <InfrastructureView />
      </AppShell>
    </ProtectedRolePage>
  );
}
