"use client";

import {
  activitySummaryForStudentSchema,
  quizSummaryForStudentSchema,
  raceSummaryForStudentSchema,
  type ActivitySummaryForStudent,
  type QuizSummaryForStudent,
  type RaceSummaryForStudent,
} from "@sqweb/contracts";
import {
  Award,
  Check,
  CircleAlert,
  CircleDashed,
  ClipboardList,
  Clock3,
  FileCode2,
  Flag,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

type Tab = "activities" | "quizzes" | "races";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const activityRemarkBadge: Record<
  NonNullable<ActivitySummaryForStudent["attemptStatus"]> | "not_started",
  { label: string; className: string; icon: typeof Check }
> = {
  passed: {
    label: "Passed",
    className: "text-success bg-success/5 border-success/30",
    icon: Check,
  },
  submitted_incomplete: {
    label: "Submitted (incomplete)",
    className: "text-warning bg-warning/5 border-warning/30",
    icon: CircleAlert,
  },
  in_progress: {
    label: "In progress",
    className: "text-warning bg-warning/5 border-warning/30",
    icon: CircleDashed,
  },
  zeroed_violation: {
    label: "Zeroed",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: X,
  },
  not_started: {
    label: "Not started",
    className: "text-ink-muted bg-panel border-divider",
    icon: CircleDashed,
  },
};

const raceRemarkBadge: Record<
  NonNullable<RaceSummaryForStudent["attemptStatus"]> | "not_started",
  { label: string; className: string; icon: typeof Check }
> = {
  submitted: {
    label: "Finished",
    className: "text-success bg-success/5 border-success/30",
    icon: Check,
  },
  in_progress: {
    label: "In progress",
    className: "text-warning bg-warning/5 border-warning/30",
    icon: CircleDashed,
  },
  timed_out: {
    label: "Timed out",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: Clock3,
  },
  not_started: {
    label: "Not started",
    className: "text-ink-muted bg-panel border-divider",
    icon: CircleDashed,
  },
};

const quizRemarkBadge: Record<
  NonNullable<QuizSummaryForStudent["attemptStatus"]> | "not_started",
  { label: string; className: string; icon: typeof Check }
> = {
  submitted: {
    label: "Submitted",
    className: "text-success bg-success/5 border-success/30",
    icon: Check,
  },
  in_progress: {
    label: "In progress",
    className: "text-warning bg-warning/5 border-warning/30",
    icon: CircleDashed,
  },
  timed_out: {
    label: "Timed out",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: Clock3,
  },
  not_started: {
    label: "Not started",
    className: "text-ink-muted bg-panel border-divider",
    icon: CircleDashed,
  },
};

// Student's own reference view of every activity/quiz/Code Racing quiz in
// this class — remark and score only, no source code, since this is a
// record to check against, not a workspace to act from. Separate tabs
// rather than one merged list since the three score shapes (per-test-case
// pass/fail, exact-match quiz points, partial-credit race percentage)
// don't share a meaningful common row.
export function MyScores({ classId }: Readonly<{ classId: string }>) {
  const { authorizedFetch } = useAuth();
  const [tab, setTab] = useState<Tab>("activities");
  const [activities, setActivities] = useState<
    readonly ActivitySummaryForStudent[]
  >([]);
  const [quizzes, setQuizzes] = useState<readonly QuizSummaryForStudent[]>([]);
  const [races, setRaces] = useState<readonly RaceSummaryForStudent[]>([]);
  const [status, setStatus] = useState("Loading scores…");

  const load = useCallback(async () => {
    try {
      const [activitiesResponse, quizzesResponse, racesResponse] =
        await Promise.all([
          authorizedFetch(`/v1/classes/${classId}/activities`),
          authorizedFetch(`/v1/classes/${classId}/quizzes`),
          authorizedFetch(`/v1/classes/${classId}/races`),
        ]);
      if (!activitiesResponse.ok || !quizzesResponse.ok || !racesResponse.ok)
        throw new Error("Scores could not be loaded.");
      const parsedActivities = activitySummaryForStudentSchema
        .array()
        .parse(await activitiesResponse.json());
      const parsedQuizzes = quizSummaryForStudentSchema
        .array()
        .parse(await quizzesResponse.json());
      const parsedRaces = raceSummaryForStudentSchema
        .array()
        .parse(await racesResponse.json());
      setActivities(parsedActivities);
      setQuizzes(parsedQuizzes);
      setRaces(parsedRaces);
      setStatus("");
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "Scores could not be loaded.",
      );
    }
  }, [authorizedFetch, classId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  const activityEarned = activities.reduce(
    (total, entry) => total + (entry.score ?? 0),
    0,
  );
  const activityPossible = activities.reduce(
    (total, entry) => total + entry.points,
    0,
  );
  const quizEarned = quizzes.reduce(
    (total, entry) => total + (entry.score ?? 0),
    0,
  );
  const quizPossible = quizzes.reduce(
    (total, entry) => total + entry.totalPoints,
    0,
  );
  const raceEarned = races.reduce(
    (total, entry) => total + (entry.totalScore ?? 0),
    0,
  );
  const racePossible = races.reduce(
    (total, entry) => total + entry.totalPoints,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="border-divider flex gap-1 border-b">
        {(
          [
            { id: "activities", label: "Activities", icon: FileCode2 },
            { id: "quizzes", label: "Quizzes", icon: ClipboardList },
            { id: "races", label: "Code Racing", icon: Flag },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium ${
              tab === id
                ? "text-action-soft border-action border-b-2"
                : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            <Icon aria-hidden="true" size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "activities" ? (
        activities.length === 0 ? (
          <p className="text-ink-muted text-xs">
            {status || "No activities have been posted yet."}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="border-divider bg-panel rounded-control flex items-center justify-between border px-3 py-2">
              <span className="text-ink-muted flex items-center gap-1.5 text-xs">
                <Award aria-hidden="true" size={14} />
                Total across activities
              </span>
              <span className="text-ink-primary text-sm font-semibold tabular-nums">
                {activityEarned}/{activityPossible} pts
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="text-ink-muted border-divider border-b text-[11px] tracking-wide uppercase">
                    <th className="pr-3 pb-2 font-medium">Activity</th>
                    <th className="pr-3 pb-2 font-medium">Score</th>
                    <th className="pr-3 pb-2 font-medium">Remark</th>
                    <th className="pb-2 font-medium">Date &amp; time</th>
                  </tr>
                </thead>
                <tbody className="divide-divider divide-y">
                  {activities.map((entry) => {
                    const badge =
                      activityRemarkBadge[entry.attemptStatus ?? "not_started"];
                    const Icon = badge.icon;
                    return (
                      <tr key={entry.id}>
                        <td className="text-ink-primary py-2.5 pr-3 font-medium">
                          {entry.title}
                        </td>
                        <td className="text-ink-primary py-2.5 pr-3 tabular-nums">
                          {entry.score !== null
                            ? `${entry.score}/${entry.points}`
                            : `—/${entry.points}`}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                          >
                            <Icon aria-hidden="true" size={11} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="text-ink-muted py-2.5">
                          {entry.submittedAt
                            ? formatDate(entry.submittedAt)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : tab === "quizzes" ? (
        quizzes.length === 0 ? (
          <p className="text-ink-muted text-xs">
            {status || "No quizzes have been posted yet."}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="border-divider bg-panel rounded-control flex items-center justify-between border px-3 py-2">
              <span className="text-ink-muted flex items-center gap-1.5 text-xs">
                <Award aria-hidden="true" size={14} />
                Total across quizzes
              </span>
              <span className="text-ink-primary text-sm font-semibold tabular-nums">
                {quizEarned}/{quizPossible} pts
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="text-ink-muted border-divider border-b text-[11px] tracking-wide uppercase">
                    <th className="pr-3 pb-2 font-medium">Quiz</th>
                    <th className="pr-3 pb-2 font-medium">Score</th>
                    <th className="pr-3 pb-2 font-medium">Remark</th>
                    <th className="pb-2 font-medium">Questions</th>
                  </tr>
                </thead>
                <tbody className="divide-divider divide-y">
                  {quizzes.map((entry) => {
                    const badge =
                      quizRemarkBadge[entry.attemptStatus ?? "not_started"];
                    const Icon = badge.icon;
                    return (
                      <tr key={entry.id}>
                        <td className="text-ink-primary py-2.5 pr-3 font-medium">
                          <span className="flex items-center gap-1.5">
                            {entry.title}
                            <span className="text-ink-muted border-divider bg-panel shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium tracking-[0.06em] uppercase">
                              {entry.quizType === "code" ? "Code" : "Lecture"}
                            </span>
                          </span>
                        </td>
                        <td className="text-ink-primary py-2.5 pr-3 tabular-nums">
                          {entry.score !== null
                            ? `${entry.score}/${entry.totalPoints}`
                            : `—/${entry.totalPoints}`}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                          >
                            <Icon aria-hidden="true" size={11} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="text-ink-muted py-2.5">
                          {entry.questionCount}{" "}
                          {entry.questionCount === 1 ? "question" : "questions"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : races.length === 0 ? (
        <p className="text-ink-muted text-xs">
          {status || "No Code Racing quizzes have been posted yet."}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="border-divider bg-panel rounded-control flex items-center justify-between border px-3 py-2">
            <span className="text-ink-muted flex items-center gap-1.5 text-xs">
              <Award aria-hidden="true" size={14} />
              Total across Code Racing quizzes
            </span>
            <span className="text-ink-primary text-sm font-semibold tabular-nums">
              {raceEarned}/{racePossible} pts
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead>
                <tr className="text-ink-muted border-divider border-b text-[11px] tracking-wide uppercase">
                  <th className="pr-3 pb-2 font-medium">Code Racing quiz</th>
                  <th className="pr-3 pb-2 font-medium">Score</th>
                  <th className="pr-3 pb-2 font-medium">Remark</th>
                  <th className="pb-2 font-medium">Problems</th>
                </tr>
              </thead>
              <tbody className="divide-divider divide-y">
                {races.map((entry) => {
                  const badge =
                    raceRemarkBadge[entry.attemptStatus ?? "not_started"];
                  const Icon = badge.icon;
                  return (
                    <tr key={entry.id}>
                      <td className="text-ink-primary py-2.5 pr-3 font-medium">
                        {entry.title}
                      </td>
                      <td className="text-ink-primary py-2.5 pr-3 tabular-nums">
                        {entry.totalScore !== null
                          ? `${entry.totalScore}/${entry.totalPoints}`
                          : `—/${entry.totalPoints}`}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                        >
                          <Icon aria-hidden="true" size={11} />
                          {badge.label}
                        </span>
                      </td>
                      <td className="text-ink-muted py-2.5">
                        {entry.problemCount}{" "}
                        {entry.problemCount === 1 ? "problem" : "problems"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
