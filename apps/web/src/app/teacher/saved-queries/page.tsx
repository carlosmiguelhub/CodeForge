import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { SavedQueryList } from "@/components/workbench/saved-query-list";

export default function TeacherSavedQueriesPage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/saved-queries"
        eyebrow="Teacher workspace"
        pageTitle="Saved Queries"
      >
        <SavedQueryList role="teacher" />
      </AppShell>
    </ProtectedRolePage>
  );
}
