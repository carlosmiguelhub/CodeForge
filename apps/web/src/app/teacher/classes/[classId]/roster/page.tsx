import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { RosterPanel } from "@/components/classroom/roster-panel";

export default async function TeacherRosterPage({
  params,
}: Readonly<{ params: Promise<{ classId: string }> }>) {
  const { classId } = await params;
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/classes"
        eyebrow="Class management"
        pageTitle="Roster and invitations"
      >
        <RosterPanel classId={classId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
