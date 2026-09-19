import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ClassDetail } from "@/components/classroom/class-detail";

export default async function TeacherClassDetailPage({
  params,
}: Readonly<{ params: Promise<{ classId: string }> }>) {
  const { classId } = await params;
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/classes"
        eyebrow="Teacher workspace"
        pageTitle="My Classes"
      >
        <ClassDetail role="teacher" classId={classId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
