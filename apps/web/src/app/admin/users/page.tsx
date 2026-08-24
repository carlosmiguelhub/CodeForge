import { UserList } from "@/components/admin/user-list";
import { AppShell } from "@/components/app-shell/app-shell";
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
        <UserList />
      </AppShell>
    </ProtectedRolePage>
  );
}
