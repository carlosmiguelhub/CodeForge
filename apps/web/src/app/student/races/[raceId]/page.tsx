import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { RaceWorkspace } from "@/components/classroom/race-workspace";

export default async function StudentRacePage({
  params,
}: Readonly<{ params: Promise<{ raceId: string }> }>) {
  const { raceId } = await params;
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/classes"
        eyebrow="Student workspace"
        pageTitle="Code Racing"
      >
        <RaceWorkspace raceId={raceId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
