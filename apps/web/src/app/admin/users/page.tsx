import { AppShell } from "@/components/app-shell/app-shell";
import { PendingAccountList } from "@/components/auth/pending-account-list";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function AdministratorUsersPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin/users"
        eyebrow="Administrator workspace"
        pageTitle="Users"
      >
        <PendingAccountList />
      </AppShell>
    </ProtectedRolePage>
  );
}
