import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { RaceDetailTeacher } from "@/components/classroom/race-detail-teacher";

export default async function TeacherRacePage({
  params,
}: Readonly<{ params: Promise<{ raceId: string }> }>) {
  const { raceId } = await params;
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/classes"
        eyebrow="Teacher workspace"
        pageTitle="Code Racing"
      >
        <RaceDetailTeacher raceId={raceId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
