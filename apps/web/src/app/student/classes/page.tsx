import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ClassList } from "@/components/classroom/class-list";

export default function StudentClassesPage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/classes"
        eyebrow="Student workspace"
        pageTitle="Classes"
      >
        <ClassList role="student" />
      </AppShell>
    </ProtectedRolePage>
  );
}
