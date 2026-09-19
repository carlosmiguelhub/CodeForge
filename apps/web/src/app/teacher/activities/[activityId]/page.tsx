import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ActivityDetailTeacher } from "@/components/classroom/activity-detail-teacher";

export default async function TeacherActivityPage({
  params,
}: Readonly<{ params: Promise<{ activityId: string }> }>) {
  const { activityId } = await params;
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/classes"
        eyebrow="Teacher workspace"
        pageTitle="Activity"
      >
        <ActivityDetailTeacher activityId={activityId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
