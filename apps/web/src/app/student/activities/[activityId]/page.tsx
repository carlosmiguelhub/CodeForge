import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ActivityWorkspace } from "@/components/classroom/activity-workspace";

export default async function StudentActivityPage({
  params,
}: Readonly<{ params: Promise<{ activityId: string }> }>) {
  const { activityId } = await params;
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/classes"
        eyebrow="Student workspace"
        pageTitle="Activity"
      >
        <ActivityWorkspace activityId={activityId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
