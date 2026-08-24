import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { SavedQueryList } from "@/components/workbench/saved-query-list";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default function StudentSavedQueriesPage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/saved-queries"
        eyebrow="Student workspace"
        pageTitle="Saved Queries"
      >
        <WorkspaceLockGate workspace="saved-queries">
          <SavedQueryList role="student" />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
