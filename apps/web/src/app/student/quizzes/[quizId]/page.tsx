import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { QuizWorkspace } from "@/components/classroom/quiz-workspace";

export default async function StudentQuizPage({
  params,
}: Readonly<{ params: Promise<{ quizId: string }> }>) {
  const { quizId } = await params;
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/classes"
        eyebrow="Student workspace"
        pageTitle="Quiz"
      >
        <QuizWorkspace quizId={quizId} />
      </AppShell>
    </ProtectedRolePage>
  );
}
