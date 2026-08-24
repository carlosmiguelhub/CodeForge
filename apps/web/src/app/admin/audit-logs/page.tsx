import { AuditLogList } from "@/components/admin/audit-log-list";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function AdministratorAuditLogsPage() {
  return (
    <ProtectedRolePage role="administrator">
      <AppShell
        role="administrator"
        activeHref="/admin/audit-logs"
        eyebrow="Administrator workspace"
        pageTitle="Audit logs"
      >
        <AuditLogList />
      </AppShell>
    </ProtectedRolePage>
  );
}
