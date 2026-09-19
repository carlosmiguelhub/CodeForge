import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { QuizDetailTeacher } from "@/components/classroom/quiz-detail-teacher";

export default async function TeacherQuizPage({
  params,
}: Readonly<{ params: Promise<{ quizId: string }> }>) {
  const { quizId } = await params;
  return (
    <ProtectedRolePage role="teacher">
      <AppShell
        role="teacher"
        activeHref="/teacher/classes"
        eyebrow="Teacher workspace"
        pageTitle="Quiz"
      >
        <QuizDetailTeacher quizId={quizId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
