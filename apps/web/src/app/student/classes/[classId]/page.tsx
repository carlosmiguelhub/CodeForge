import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ClassDetail } from "@/components/classroom/class-detail";

export default async function StudentClassDetailPage({
  params,
}: Readonly<{ params: Promise<{ classId: string }> }>) {
  const { classId } = await params;
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/classes"
        eyebrow="Student workspace"
        pageTitle="My Classes"
      >
        <ClassDetail role="student" classId={classId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
