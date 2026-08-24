import { SectionList } from "@/components/admin/section-list";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function AdministratorSectionsPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin/sections"
        eyebrow="Administrator workspace"
        pageTitle="Sections"
      >
        <SectionList />
      </AppShell>
    </ProtectedRolePage>
  );
}
