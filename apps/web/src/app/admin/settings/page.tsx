import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { SystemSettingsView } from "@/components/admin/system-settings-view";

export default function SystemSettingsPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin/settings"
        eyebrow="Administrator workspace"
        pageTitle="System Settings"
      >
        <SystemSettingsView />
      </AppShell>
    </ProtectedRolePage>
  );
}
