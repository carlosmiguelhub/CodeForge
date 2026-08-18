import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { AcademicCatalogPanel } from "@/components/classroom/academic-catalog-panel";

export default function AdminAcademicsPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin/academics"
        eyebrow="Platform administration"
        pageTitle="Academic catalog"
      >
        <AcademicCatalogPanel />
      </AppShell>
    </ProtectedRolePage>
  );
}
