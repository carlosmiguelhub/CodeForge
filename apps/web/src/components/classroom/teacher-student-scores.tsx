"use client";

import {
  QUIZ_ALLOWED_VIOLATIONS,
  QUIZ_VIOLATION_DEDUCTION_PERCENT,
  activitySubmissionSchema,
  activitySummaryForTeacherSchema,
  quizSubmissionSchema,
  quizSummaryForTeacherSchema,
  raceSubmissionSchema,
  raceSummaryForTeacherSchema,
  violationDeductionAmount,
  type ActivitySubmission,
  type ActivitySummaryForTeacher,
  type QuizSubmission,
  type QuizSummaryForTeacher,
  type RaceSubmission,
  type RaceSummaryForTeacher,
} from "@sqweb/contracts";
import {
  Check,
  CircleDashed,
  ClipboardList,
  Clock3,
  FileCode2,
  Flag,
  ShieldAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

type Tab = "activities" | "quizzes" | "races";

const activityStatusBadge: Record<
  ActivitySubmission["status"],
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
    icon: CircleDashed,
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
    label: "Not participated",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: X,
  },
};

const quizStatusBadge: Record<
  QuizSubmission["status"],
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
    label: "Not participated",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: X,
  },
};

const raceStatusBadge: Record<
  NonNullable<RaceSubmission["attemptStatus"]> | "not_started",
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
    label: "Not participated",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: X,
  },
};

// Teacher-only gradebook view — a class-wide entry point into per-activity/
// per-race rosters that already exist one level down (ActivityDetailTeacher
// and RaceDetailTeacher's own Submissions tabs), so a teacher doesn't have
// to open each activity individually just to see who's scored what. A
// student who never attempted still gets a row (both list endpoints already
// left-join every active class member), called out as "Not participated"
// rather than silently omitted.
export function TeacherStudentScores({
  classId,
}: Readonly<{ classId: string }>) {
  const { authorizedFetch } = useAuth();
  const [tab, setTab] = useState<Tab>("activities");
  const [activities, setActivities] = useState<
    readonly ActivitySummaryForTeacher[]
  >([]);
  const [quizzes, setQuizzes] = useState<readonly QuizSummaryForTeacher[]>([]);
  const [races, setRaces] = useState<readonly RaceSummaryForTeacher[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [activitySubmissions, setActivitySubmissions] = useState<
    readonly ActivitySubmission[] | null
  >(null);
  const [quizSubmissions, setQuizSubmissions] = useState<
    readonly QuizSubmission[] | null
  >(null);
  const [raceSubmissions, setRaceSubmissions] = useState<
    readonly RaceSubmission[] | null
  >(null);
  const [rosterStatus, setRosterStatus] = useState("");

  const loadList = useCallback(async () => {
    try {
      const [activitiesResponse, quizzesResponse, racesResponse] =
        await Promise.all([
          authorizedFetch(`/v1/classes/${classId}/activities`),
          authorizedFetch(`/v1/classes/${classId}/quizzes`),
          authorizedFetch(`/v1/classes/${classId}/races`),
        ]);
      if (!activitiesResponse.ok || !quizzesResponse.ok || !racesResponse.ok)
        throw new Error("Scores could not be loaded.");
      setActivities(
        activitySummaryForTeacherSchema
          .array()
          .parse(await activitiesResponse.json()),
      );
      setQuizzes(
        quizSummaryForTeacherSchema.array().parse(await quizzesResponse.json()),
      );
      setRaces(
        raceSummaryForTeacherSchema.array().parse(await racesResponse.json()),
      );
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
    const timer = window.setTimeout(() => void loadList(), 0);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  usePolling(() => void loadList(), DEFAULT_POLL_INTERVAL_MS);

  const loadActivityRoster = useCallback(
    async (activityId: string) => {
      try {
        const response = await authorizedFetch(
          `/v1/activities/${activityId}/submissions`,
        );
        if (!response.ok) throw new Error("Scores could not be loaded.");
        setActivitySubmissions(
          activitySubmissionSchema.array().parse(await response.json()),
        );
        setRosterStatus("");
      } catch (loadError) {
        setActivitySubmissions(null);
        setRosterStatus(
          loadError instanceof Error
            ? loadError.message
            : "Scores could not be loaded.",
        );
      }
    },
    [authorizedFetch],
  );

  const loadQuizRoster = useCallback(
    async (quizId: string) => {
      try {
        const response = await authorizedFetch(
          `/v1/quizzes/${quizId}/submissions`,
        );
        if (!response.ok) throw new Error("Scores could not be loaded.");
        setQuizSubmissions(
          quizSubmissionSchema.array().parse(await response.json()),
        );
        setRosterStatus("");
      } catch (loadError) {
        setQuizSubmissions(null);
        setRosterStatus(
          loadError instanceof Error
            ? loadError.message
            : "Scores could not be loaded.",
        );
      }
    },
    [authorizedFetch],
  );

  const loadRaceRoster = useCallback(
    async (raceId: string) => {
      try {
        const response = await authorizedFetch(
          `/v1/races/${raceId}/submissions`,
        );
        if (!response.ok) throw new Error("Scores could not be loaded.");
        setRaceSubmissions(
          raceSubmissionSchema.array().parse(await response.json()),
        );
        setRosterStatus("");
      } catch (loadError) {
        setRaceSubmissions(null);
        setRosterStatus(
          loadError instanceof Error
            ? loadError.message
            : "Scores could not be loaded.",
        );
      }
    },
    [authorizedFetch],
  );

  useEffect(() => {
    if (!selectedActivityId) return;
    const timer = window.setTimeout(
      () => void loadActivityRoster(selectedActivityId),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [selectedActivityId, loadActivityRoster]);

  useEffect(() => {
    if (!selectedQuizId) return;
    const timer = window.setTimeout(
      () => void loadQuizRoster(selectedQuizId),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [selectedQuizId, loadQuizRoster]);

  useEffect(() => {
    if (!selectedRaceId) return;
    const timer = window.setTimeout(
      () => void loadRaceRoster(selectedRaceId),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [selectedRaceId, loadRaceRoster]);

  usePolling(() => {
    if (tab === "activities" && selectedActivityId)
      void loadActivityRoster(selectedActivityId);
    if (tab === "quizzes" && selectedQuizId) void loadQuizRoster(selectedQuizId);
    if (tab === "races" && selectedRaceId) void loadRaceRoster(selectedRaceId);
  }, DEFAULT_POLL_INTERVAL_MS);

  function switchTab(next: Tab) {
    setTab(next);
  }

  const selectedActivity = activities.find(
    (entry) => entry.id === selectedActivityId,
  );
  const selectedQuiz = quizzes.find((entry) => entry.id === selectedQuizId);
  const selectedRace = races.find((entry) => entry.id === selectedRaceId);

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
            onClick={() => switchTab(id)}
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

      <div className="grid gap-3 lg:grid-cols-[240px_1fr] lg:items-start">
        <div className="border-structural bg-surface rounded-panel border p-2">
          {tab === "activities" ? (
            activities.length === 0 ? (
              <p className="text-ink-muted p-2 text-xs">
                {status || "No activities have been posted yet."}
              </p>
            ) : (
              <ul className="space-y-1">
                {activities.map((activity, index) => (
                  <li key={activity.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedActivityId(activity.id)}
                      className={`rounded-control block w-full px-2.5 py-2 text-left text-xs font-medium ${
                        activity.id === selectedActivityId
                          ? "bg-action text-white"
                          : "text-ink-secondary hover:bg-panel"
                      }`}
                    >
                      <span className="block truncate">
                        Activity {index + 1}: {activity.title}
                      </span>
                      <span
                        className={`mt-0.5 block text-[10px] ${
                          activity.id === selectedActivityId
                            ? "text-white/80"
                            : "text-ink-muted"
                        }`}
                      >
                        {activity.passedCount}/{activity.memberCount} passed
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : tab === "quizzes" ? (
            quizzes.length === 0 ? (
              <p className="text-ink-muted p-2 text-xs">
                {status || "No quizzes have been posted yet."}
              </p>
            ) : (
              <ul className="space-y-1">
                {quizzes.map((quiz, index) => (
                  <li key={quiz.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedQuizId(quiz.id)}
                      className={`rounded-control block w-full px-2.5 py-2 text-left text-xs font-medium ${
                        quiz.id === selectedQuizId
                          ? "bg-action text-white"
                          : "text-ink-secondary hover:bg-panel"
                      }`}
                    >
                      <span className="block truncate">
                        Quiz {index + 1}: {quiz.title}
                      </span>
                      <span
                        className={`mt-0.5 block text-[10px] ${
                          quiz.id === selectedQuizId
                            ? "text-white/80"
                            : "text-ink-muted"
                        }`}
                      >
                        {quiz.submittedCount}/{quiz.memberCount} submitted
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : races.length === 0 ? (
            <p className="text-ink-muted p-2 text-xs">
              {status || "No Code Racing quizzes have been posted yet."}
            </p>
          ) : (
            <ul className="space-y-1">
              {races.map((race, index) => (
                <li key={race.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRaceId(race.id)}
                    className={`rounded-control block w-full px-2.5 py-2 text-left text-xs font-medium ${
                      race.id === selectedRaceId
                        ? "bg-action text-white"
                        : "text-ink-secondary hover:bg-panel"
                    }`}
                  >
                    <span className="block truncate">
                      Code Racing {index + 1}: {race.title}
                    </span>
                    <span
                      className={`mt-0.5 block text-[10px] ${
                        race.id === selectedRaceId
                          ? "text-white/80"
                          : "text-ink-muted"
                      }`}
                    >
                      {race.submittedCount}/{race.memberCount} finished
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-structural bg-surface rounded-panel border p-3">
          {tab === "activities" ? (
            !selectedActivityId ? (
              <p className="text-ink-muted text-xs">
                Select an activity to see every student&apos;s score.
              </p>
            ) : !activitySubmissions ? (
              <div className="flex items-center gap-2">
                <Spinner size={14} />
                <p className="text-ink-muted text-xs">
                  {rosterStatus || "Loading scores…"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-ink-primary text-sm font-semibold">
                  {selectedActivity?.title}
                </h3>
                <ul className="divide-divider divide-y">
                  {activitySubmissions.map((submission) => {
                    const badge = activityStatusBadge[submission.status];
                    const Icon = badge.icon;
                    return (
                      <li
                        key={submission.studentId}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <p className="text-ink-primary min-w-0 flex-1 truncate text-sm font-medium">
                          {submission.studentName}
                        </p>
                        <span className="text-ink-primary shrink-0 text-xs font-semibold tabular-nums">
                          {submission.score !== null
                            ? `${submission.score}/${submission.totalPoints}`
                            : `—/${submission.totalPoints}`}
                        </span>
                        <span
                          className={`rounded-control flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                        >
                          <Icon aria-hidden="true" size={11} />
                          {badge.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : tab === "quizzes" ? (
            !selectedQuizId ? (
              <p className="text-ink-muted text-xs">
                Select a quiz to see every student&apos;s score.
              </p>
            ) : !quizSubmissions ? (
              <div className="flex items-center gap-2">
                <Spinner size={14} />
                <p className="text-ink-muted text-xs">
                  {rosterStatus || "Loading scores…"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-ink-primary text-sm font-semibold">
                  {selectedQuiz?.title}
                </h3>
                <ul className="divide-divider divide-y">
                  {quizSubmissions.map((submission) => {
                    const badge = quizStatusBadge[submission.status];
                    const Icon = badge.icon;
                    const excessViolations = Math.max(
                      0,
                      submission.violationCount - QUIZ_ALLOWED_VIOLATIONS,
                    );
                    const deduction = violationDeductionAmount(
                      submission.totalPoints,
                      submission.violationCount,
                      QUIZ_ALLOWED_VIOLATIONS,
                      QUIZ_VIOLATION_DEDUCTION_PERCENT,
                    );
                    return (
                      <li key={submission.studentId} className="py-2.5">
                        <div className="flex items-center gap-3">
                          <p className="text-ink-primary min-w-0 flex-1 truncate text-sm font-medium">
                            {submission.studentName}
                          </p>
                          {submission.violationCount > 0 ? (
                            <span className="text-danger border-danger/30 bg-danger/5 rounded-control flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium">
                              <ShieldAlert aria-hidden="true" size={11} />
                              {submission.violationCount}/
                              {QUIZ_ALLOWED_VIOLATIONS}
                            </span>
                          ) : null}
                          <span className="text-ink-primary shrink-0 text-xs font-semibold tabular-nums">
                            {submission.score !== null
                              ? `${submission.score}/${submission.totalPoints}`
                              : `—/${submission.totalPoints}`}
                          </span>
                          <span
                            className={`rounded-control flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                          >
                            <Icon aria-hidden="true" size={11} />
                            {badge.label}
                          </span>
                        </div>
                        {deduction > 0 ? (
                          <p className="text-warning mt-0.5 text-[10px]">
                            {submission.violationCount} distractions —{" "}
                            {excessViolations} beyond the{" "}
                            {QUIZ_ALLOWED_VIOLATIONS} allowed: −{deduction} pts
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : !selectedRaceId ? (
            <p className="text-ink-muted text-xs">
              Select a Code Racing quiz to see every student&apos;s score.
            </p>
          ) : !raceSubmissions ? (
            <div className="flex items-center gap-2">
              <Spinner size={14} />
              <p className="text-ink-muted text-xs">
                {rosterStatus || "Loading scores…"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-ink-primary text-sm font-semibold">
                {selectedRace?.title}
              </h3>
              <ul className="divide-divider divide-y">
                {raceSubmissions.map((submission) => {
                  const badge =
                    raceStatusBadge[submission.attemptStatus ?? "not_started"];
                  const Icon = badge.icon;
                  return (
                    <li
                      key={submission.studentId}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <p className="text-ink-primary min-w-0 flex-1 truncate text-sm font-medium">
                        {submission.studentName}
                      </p>
                      <span className="text-ink-primary shrink-0 text-xs font-semibold tabular-nums">
                        {submission.totalScore}/{submission.totalPoints}
                      </span>
                      <span
                        className={`rounded-control flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                      >
                        <Icon aria-hidden="true" size={11} />
                        {badge.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
