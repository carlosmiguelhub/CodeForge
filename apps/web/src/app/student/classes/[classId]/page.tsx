import Link from "next/link";

import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default async function StudentClassPage({
  params,
}: Readonly<{ params: Promise<{ classId: string }> }>) {
  const { classId } = await params;
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/classes"
        eyebrow="Class workspace"
        pageTitle="Class overview"
      >
        <section className="border-structural bg-surface rounded-panel border p-5">
          <h2 className="font-heading text-ink-primary text-lg font-semibold">
            Class joined
          </h2>
          <p className="text-ink-muted mt-2 text-sm">
            Activities and SQL workspaces will become available in their
            approved milestones.
          </p>
          <p className="text-ink-muted mt-4 font-mono text-xs">
            Class ID: {classId}
          </p>
          <Link
            href="/student/classes"
            className="text-action-soft mt-5 inline-flex min-h-9 items-center"
          >
            Return to classes
          </Link>
        </section>
      </AppShell>
    </ProtectedRolePage>
  );
}
