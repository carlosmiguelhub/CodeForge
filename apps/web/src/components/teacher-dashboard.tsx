"use client";

import {
  activitySummaryForTeacherSchema,
  classSchema,
  quizSummaryForTeacherSchema,
  raceSummaryForTeacherSchema,
  type ActivitySummaryForTeacher,
  type Class,
  type QuizSummaryForTeacher,
  type RaceSummaryForTeacher,
} from "@sqweb/contracts";
import {
  Clock3,
  FileCode2,
  Flag,
  GraduationCap,
  ClipboardList,
  ListChecks,
  Plus,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatClosesIn, formatDate } from "@/lib/dashboard-format";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

const CLOSING_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

interface AttentionItem {
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
  activities: readonly ActivitySummaryForTeacher[];
  quizzes: readonly QuizSummaryForTeacher[];
  races: readonly RaceSummaryForTeacher[];
}

export function TeacherDashboard() {
  const { authorizedFetch } = useAuth();
  const [bundles, setBundles] = useState<readonly ClassBundle[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Captured once per successful load rather than read with Date.now()
  // inside the `stats` memo below — memo bodies must stay pure, and this
  // still refreshes "closing soon" on the same cadence as the data itself
  // via usePolling.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const classesResponse = await authorizedFetch("/v1/classes/teaching");
      if (!classesResponse.ok) throw new Error("Classes could not be loaded.");
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
              ? activitySummaryForTeacherSchema
                  .array()
                  .parse(await activitiesRes.json())
              : [],
            quizzes: quizzesRes.ok
              ? quizSummaryForTeacherSchema
                  .array()
                  .parse(await quizzesRes.json())
              : [],
            races: racesRes.ok
              ? raceSummaryForTeacherSchema.array().parse(await racesRes.json())
              : [],
          };
        }),
      );
      setBundles(loaded);
      setLoadedAt(Date.now());
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
    const totalStudents = bundles.reduce(
      (sum, bundle) => sum + bundle.entry.memberCount,
      0,
    );

    const attention: AttentionItem[] = [];
    const now = loadedAt;

    for (const bundle of bundles) {
      for (const activity of bundle.activities) {
        if (
          !activity.isLocked &&
          activity.deadlineAt &&
          Date.parse(activity.deadlineAt) - now <= CLOSING_SOON_WINDOW_MS &&
          Date.parse(activity.deadlineAt) - now > 0
        ) {
          attention.push({
            key: `activity-deadline-${activity.id}`,
            kind: "activity",
            classId: bundle.entry.id,
            className: bundle.entry.subjectName,
            title: activity.title,
            href: `/teacher/activities/${activity.id}`,
            detail: formatClosesIn(activity.deadlineAt),
            urgencyMs: Date.parse(activity.deadlineAt),
          });
        }
        if (activity.zeroedCount > 0) {
          attention.push({
            key: `activity-zeroed-${activity.id}`,
            kind: "activity",
            classId: bundle.entry.id,
            className: bundle.entry.subjectName,
            title: activity.title,
            href: `/teacher/activities/${activity.id}`,
            detail: `${activity.zeroedCount} zeroed ${activity.zeroedCount === 1 ? "submission" : "submissions"} to review`,
            urgencyMs: now,
          });
        }
      }
      for (const quiz of bundle.quizzes) {
        if (
          quiz.availability === "open" &&
          Date.parse(quiz.closesAt) - now <= CLOSING_SOON_WINDOW_MS
        ) {
          attention.push({
            key: `quiz-deadline-${quiz.id}`,
            kind: "quiz",
            classId: bundle.entry.id,
            className: bundle.entry.subjectName,
            title: quiz.title,
            href: `/teacher/quizzes/${quiz.id}`,
            detail: formatClosesIn(quiz.closesAt),
            urgencyMs: Date.parse(quiz.closesAt),
          });
        }
      }
      for (const race of bundle.races) {
        if (
          race.availability === "open" &&
          Date.parse(race.closesAt) - now <= CLOSING_SOON_WINDOW_MS
        ) {
          attention.push({
            key: `race-deadline-${race.id}`,
            kind: "race",
            classId: bundle.entry.id,
            className: bundle.entry.subjectName,
            title: race.title,
            href: `/teacher/races/${race.id}`,
            detail: formatClosesIn(race.closesAt),
            urgencyMs: Date.parse(race.closesAt),
          });
        }
      }
    }
    attention.sort((a, b) => a.urgencyMs - b.urgencyMs);

    const recentClasses = [...bundles]
      .sort(
        (a, b) => Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt),
      )
      .slice(0, 4);

    return { totalClasses, totalStudents, attention, recentClasses };
  }, [bundles, loadedAt]);

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
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-ink-primary text-2xl font-semibold tracking-[-0.03em]">
            Welcome back
          </h2>
          <p className="text-ink-muted mt-1 text-sm">
            {stats!.totalClasses}{" "}
            {stats!.totalClasses === 1 ? "class" : "classes"} ·{" "}
            {stats!.totalStudents}{" "}
            {stats!.totalStudents === 1 ? "student" : "students"} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/teacher/classes"
            className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold text-white"
          >
            <Plus aria-hidden="true" size={14} />
            New class
          </Link>
          <Link
            href="/teacher/classes"
            className="rounded-control border-structural hover:border-action/50 flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold"
          >
            <FileCode2 aria-hidden="true" size={14} />
            New activity
          </Link>
          <Link
            href="/teacher/classes"
            className="rounded-control border-structural hover:border-action/50 flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold"
          >
            <ClipboardList aria-hidden="true" size={14} />
            New quiz
          </Link>
          <Link
            href="/teacher/classes"
            className="rounded-control border-structural hover:border-action/50 flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold"
          >
            <Flag aria-hidden="true" size={14} />
            New race
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={GraduationCap}
          label="Active classes"
          value={stats!.totalClasses}
        />
        <StatTile icon={Users} label="Students" value={stats!.totalStudents} />
        <StatTile
          icon={ShieldAlert}
          label="Needs attention"
          value={stats!.attention.length}
          tone={stats!.attention.length > 0 ? "warning" : "neutral"}
        />
      </section>

      <section
        aria-labelledby="attention-title"
        className="border-structural bg-surface rounded-panel overflow-hidden border"
      >
        <div className="border-divider flex items-center justify-between border-b px-4 py-3">
          <h3
            id="attention-title"
            className="font-heading text-ink-primary flex items-center gap-2 text-base font-semibold"
          >
            <ShieldAlert aria-hidden="true" size={15} />
            Needs attention
          </h3>
        </div>
        {stats!.attention.length === 0 ? (
          <p className="text-ink-muted p-4 text-xs">
            Nothing closing soon and nothing flagged for review.
          </p>
        ) : (
          <ul className="divide-divider divide-y">
            {stats!.attention.map((item) => {
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
            <ListChecks aria-hidden="true" size={15} />
            My classes
          </h3>
          <Link
            href="/teacher/classes"
            className="text-action-soft text-xs hover:underline"
          >
            View all →
          </Link>
        </div>
        {stats!.recentClasses.length === 0 ? (
          <p className="text-ink-muted text-xs">
            You haven&apos;t created a class yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats!.recentClasses.map((bundle) => (
              <li key={bundle.entry.id}>
                <Link
                  href={`/teacher/classes/${bundle.entry.id}`}
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
                        {bundle.entry.sectionLabel}
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
