import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { TopContributorsView } from "@/components/admin/top-contributors-view";

export default function TopContributorsPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin/top-contributors"
        eyebrow="Administrator workspace"
        pageTitle="Top Contributors"
      >
        <TopContributorsView />
      </AppShell>
    </ProtectedRolePage>
  );
}
