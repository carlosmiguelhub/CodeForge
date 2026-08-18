import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { ClassList } from "@/components/classroom/class-list";

export default function TeacherClassesPage() {
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/classes"
        eyebrow="Teacher workspace"
        pageTitle="Classes"
      >
        <ClassList role="teacher" />
      </AppShell>
    </ProtectedRolePage>
  );
}
