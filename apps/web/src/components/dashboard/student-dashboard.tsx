"use client";

import {
  activitySummaryForStudentSchema,
  classSchema,
  quizSummaryForStudentSchema,
  raceSummaryForStudentSchema,
  type ActivitySummaryForStudent,
  type Class,
  type QuizSummaryForStudent,
  type RaceSummaryForStudent,
} from "@sqweb/contracts";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCode2,
  Flag,
  GraduationCap,
  Inbox,
  ListChecks,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Spinner } from "@/components/ui/spinner";
import { formatClosesIn, formatDate } from "@/lib/dashboard-format";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

interface TodoItem {
  key: string;
  kind: "activity" | "quiz" | "race";
  classId: string;
  className: string;
  title: string;
  href: string;
  detail: string;
  urgencyMs: number;
}

interface ClassBundle {
  entry: Class;
  activities: readonly ActivitySummaryForStudent[];
  quizzes: readonly QuizSummaryForStudent[];
  races: readonly RaceSummaryForStudent[];
}

export function StudentDashboard() {
  const { authorizedFetch } = useAuth();
  const [bundles, setBundles] = useState<readonly ClassBundle[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const classesResponse = await authorizedFetch("/v1/classes/enrolled");
      if (!classesResponse.ok)
        throw new Error("Classes could not be loaded.");
      const classes = classSchema.array().parse(await classesResponse.json());
      const active = classes.filter((entry) => !entry.archivedAt);

      const loaded = await Promise.all(
        active.map(async (entry): Promise<ClassBundle> => {
          const [activitiesRes, quizzesRes, racesRes] = await Promise.all([
            authorizedFetch(`/v1/classes/${entry.id}/activities`),
            authorizedFetch(`/v1/classes/${entry.id}/quizzes`),
            authorizedFetch(`/v1/classes/${entry.id}/races`),
          ]);
          return {
            entry,
            activities: activitiesRes.ok
              ? activitySummaryForStudentSchema
                  .array()
                  .parse(await activitiesRes.json())
              : [],
            quizzes: quizzesRes.ok
              ? quizSummaryForStudentSchema
                  .array()
                  .parse(await quizzesRes.json())
              : [],
            races: racesRes.ok
              ? raceSummaryForStudentSchema
                  .array()
                  .parse(await racesRes.json())
              : [],
          };
        }),
      );
      setBundles(loaded);
      setStatus(null);
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "The dashboard could not be loaded.",
      );
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  const stats = useMemo(() => {
    if (!bundles) return null;
    const totalClasses = bundles.length;

    const todo: TodoItem[] = [];
    let completedCount = 0;

    for (const bundle of bundles) {
      for (const activity of bundle.activities) {
        const notSubmitted =
          activity.attemptStatus === null ||
          activity.attemptStatus === "in_progress";
        if (!notSubmitted) {
          completedCount += 1;
          continue;
        }
        if (activity.isLocked) continue;
        todo.push({
          key: `activity-${activity.id}`,
          kind: "activity",
          classId: bundle.entry.id,
          className: bundle.entry.subjectName,
          title: activity.title,
          href: `/student/activities/${activity.id}`,
          detail: activity.deadlineAt
            ? `${activity.attemptStatus === "in_progress" ? "Continue" : "Not started"} · ${formatClosesIn(activity.deadlineAt)}`
            : activity.attemptStatus === "in_progress"
              ? "Continue"
              : "Not started",
          urgencyMs: activity.deadlineAt
            ? Date.parse(activity.deadlineAt)
            : Number.MAX_SAFE_INTEGER,
        });
      }
      for (const quiz of bundle.quizzes) {
        const notSubmitted =
          quiz.attemptStatus === null || quiz.attemptStatus === "in_progress";
        if (!notSubmitted) {
          completedCount += 1;
          continue;
        }
        if (quiz.availability !== "open") continue;
        todo.push({
          key: `quiz-${quiz.id}`,
          kind: "quiz",
          classId: bundle.entry.id,
          className: bundle.entry.subjectName,
          title: quiz.title,
          href: `/student/quizzes/${quiz.id}`,
          detail: `${quiz.attemptStatus === "in_progress" ? "Continue" : "Not started"} · ${formatClosesIn(quiz.closesAt)}`,
          urgencyMs: Date.parse(quiz.closesAt),
        });
      }
      for (const race of bundle.races) {
        const notSubmitted =
          race.attemptStatus === null || race.attemptStatus === "in_progress";
        if (!notSubmitted) {
          completedCount += 1;
          continue;
        }
        if (race.availability !== "open") continue;
        todo.push({
          key: `race-${race.id}`,
          kind: "race",
          classId: bundle.entry.id,
          className: bundle.entry.subjectName,
          title: race.title,
          href: `/student/races/${race.id}`,
          detail: `${race.attemptStatus === "in_progress" ? "Continue" : "Not started"} · ${formatClosesIn(race.closesAt)}`,
          urgencyMs: Date.parse(race.closesAt),
        });
      }
    }
    todo.sort((a, b) => a.urgencyMs - b.urgencyMs);

    const recentClasses = [...bundles]
      .sort(
        (a, b) =>
          Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt),
      )
      .slice(0, 4);

    return { totalClasses, todo, completedCount, recentClasses };
  }, [bundles]);

  if (!bundles) {
    return (
      <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
        <Spinner size={16} />
        <p className="text-ink-muted text-xs">
          {status ?? "Loading dashboard…"}
        </p>
      </div>
    );
  }

  if (status) {
    return (
      <div className="border-danger/30 bg-danger/5 text-danger rounded-panel border p-4 text-sm">
        {status}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-heading text-ink-primary text-2xl font-semibold tracking-[-0.03em]">
          Welcome back
        </h2>
        <p className="text-ink-muted mt-1 text-sm">
          {stats!.totalClasses}{" "}
          {stats!.totalClasses === 1 ? "class" : "classes"} ·{" "}
          {stats!.todo.length} pending
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={GraduationCap}
          label="Classes enrolled"
          value={stats!.totalClasses}
        />
        <StatTile
          icon={Inbox}
          label="Pending"
          value={stats!.todo.length}
          tone={stats!.todo.length > 0 ? "warning" : "neutral"}
        />
        <StatTile
          icon={CheckCircle2}
          label="Completed"
          value={stats!.completedCount}
        />
      </section>

      <section
        aria-labelledby="todo-title"
        className="border-structural bg-surface rounded-panel overflow-hidden border"
      >
        <div className="border-divider flex items-center justify-between border-b px-4 py-3">
          <h3
            id="todo-title"
            className="font-heading text-ink-primary flex items-center gap-2 text-base font-semibold"
          >
            <ListChecks aria-hidden="true" size={15} />
            To do
          </h3>
        </div>
        {stats!.todo.length === 0 ? (
          <p className="text-ink-muted p-4 text-xs">
            Nothing open right now — you&apos;re all caught up.
          </p>
        ) : (
          <ul className="divide-divider divide-y">
            {stats!.todo.map((item) => {
              const Icon =
                item.kind === "activity"
                  ? FileCode2
                  : item.kind === "quiz"
                    ? ClipboardList
                    : Flag;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="hover:bg-panel flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="border-divider bg-elevated text-action-soft rounded-control grid size-8 shrink-0 place-items-center border">
                      <Icon aria-hidden="true" size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-primary block truncate font-medium">
                        {item.title}
                      </span>
                      <span className="text-ink-muted block truncate text-[11px]">
                        {item.className}
                      </span>
                    </span>
                    <span className="text-warning flex shrink-0 items-center gap-1 text-[11px] font-medium">
                      <Clock3 aria-hidden="true" size={12} />
                      {item.detail}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-classes-title">
        <div className="mb-3 flex items-center justify-between">
          <h3
            id="my-classes-title"
            className="font-heading text-ink-primary flex items-center gap-2 text-base font-semibold"
          >
            <GraduationCap aria-hidden="true" size={15} />
            My classes
          </h3>
          <Link
            href="/student/classes"
            className="text-action-soft text-xs hover:underline"
          >
            View all →
          </Link>
        </div>
        {stats!.recentClasses.length === 0 ? (
          <p className="text-ink-muted text-xs">
            You haven&apos;t joined a class yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats!.recentClasses.map((bundle) => (
              <li key={bundle.entry.id}>
                <Link
                  href={`/student/classes/${bundle.entry.id}`}
                  className="border-structural bg-surface rounded-panel hover:border-action/50 block border p-4 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="border-divider bg-elevated text-action-soft rounded-control grid size-9 shrink-0 place-items-center border">
                      <GraduationCap aria-hidden="true" size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-primary truncate text-sm font-semibold">
                        {bundle.entry.subjectName}
                      </p>
                      <p className="text-ink-muted mt-0.5 truncate text-xs">
                        {bundle.entry.sectionLabel} · {bundle.entry.teacherName}
                      </p>
                    </div>
                  </div>
                  <div className="text-ink-muted mt-3 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1">
                      <Users aria-hidden="true" size={12} />
                      {bundle.entry.memberCount}{" "}
                      {bundle.entry.memberCount === 1 ? "student" : "students"}
                    </span>
                    <span>{formatDate(bundle.entry.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
