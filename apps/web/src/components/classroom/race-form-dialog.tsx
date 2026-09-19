"use client";

import {
  activityComparisonModeSchema,
  activityGenerateResponseSchema,
  activityVerifyReferenceResponseSchema,
  codeLanguageSchema,
  raceForTeacherSchema,
  type ActivityComparisonMode,
  type ActivityGenerateRequest,
  type ActivityVerifyReferenceResult,
  type CodeLanguage,
  type RaceForTeacher,
} from "@sqweb/contracts";
import {
  Check,
  CircleAlert,
  Flag,
  Plus,
  Sparkles,
  TestTube2,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";

import { InstructionsEditor } from "./instructions-editor";

// Appends field-level detail when the server sent it, same helper as
// activity-form-dialog.tsx's — the AI-generate and Verify endpoints these
// calls hit are execution-api's, so the same ZodError shape applies.
function errorMessageFrom(
  payload: {
    error?: {
      message?: string;
      fieldErrors?: readonly { path: string; message: string }[];
    };
  } | null,
  fallback: string,
): string {
  const message = payload?.error?.message ?? fallback;
  const fieldErrors = payload?.error?.fieldErrors;
  if (!fieldErrors || fieldErrors.length === 0) return message;
  const detail = fieldErrors
    .map((fieldError) => `${fieldError.path}: ${fieldError.message}`)
    .join("; ");
  return `${message} (${detail})`;
}

const languages = codeLanguageSchema.options;
const comparisonModes = activityComparisonModeSchema.options;

const comparisonModeLabel: Record<ActivityComparisonMode, string> = {
  normalized_exact: "Normalized exact match",
  token: "Whitespace-insensitive token match",
  numeric: "Numeric values with tolerance",
  suffix_exact: "Ends with answer key (prompts allowed)",
};

interface TestCaseDraft {
  stdin: string;
  expectedStdout: string;
  isHidden: boolean;
  showExpectedOutput: boolean;
}

interface ProblemDraft {
  key: string;
  title: string;
  instructions: string;
  language: CodeLanguage;
  starterCode: string;
  referenceSolution: string;
  comparisonMode: ActivityComparisonMode;
  numericTolerance: number;
  points: number;
  testCases: readonly TestCaseDraft[];
  // "Generate with AI" draft state, mirrors activity-form-dialog.tsx's —
  // one independent copy per problem, since each is generated separately.
  topic: string;
  difficulty: ActivityGenerateRequest["difficulty"];
  generateTestCaseCount: number;
  generating: boolean;
  generateError: string | null;
  verifying: boolean;
  verifyError: string | null;
  verifyResults: readonly ActivityVerifyReferenceResult[] | null;
}

function newProblem(key: string): ProblemDraft {
  return {
    key,
    title: "",
    instructions: "",
    language: "python",
    starterCode: "",
    referenceSolution: "",
    comparisonMode: "suffix_exact",
    numericTolerance: 0.001,
    points: 100,
    testCases: [
      {
        stdin: "",
        expectedStdout: "",
        isHidden: false,
        showExpectedOutput: true,
      },
    ],
    topic: "",
    difficulty: "beginner",
    generateTestCaseCount: 3,
    generating: false,
    generateError: null,
    verifying: false,
    verifyError: null,
    verifyResults: null,
  };
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function problemToDraft(
  problem: RaceForTeacher["problems"][number],
  key: string,
): ProblemDraft {
  return {
    key,
    title: problem.title,
    instructions: problem.instructions,
    language: problem.language,
    starterCode: problem.starterCode ?? "",
    referenceSolution: problem.referenceSolution ?? "",
    comparisonMode: problem.comparisonMode,
    numericTolerance: problem.numericTolerance ?? 0.001,
    points: problem.points,
    testCases: problem.testCases.map((testCase) => ({
      stdin: testCase.stdin,
      expectedStdout: testCase.expectedStdout,
      isHidden: testCase.isHidden,
      showExpectedOutput: testCase.showExpectedOutput,
    })),
    topic: "",
    difficulty: "beginner",
    generateTestCaseCount: 3,
    generating: false,
    generateError: null,
    verifying: false,
    verifyError: null,
    verifyResults: null,
  };
}

// classId/onSaved cover both create (new race, posted immediately under
// this class) and edit (existing race, `race` supplied) — same single-
// dialog-does-both-modes precedent as ActivityFormDialog. Edit never
// touches opensAt/closesAt/status; those stay the teacher's separate
// Extend/Reopen control on the detail page so the two never race each
// other in one request.
export function RaceFormDialog({
  classId,
  race,
  onClose,
  onSaved,
}: Readonly<{
  classId: string;
  race?: RaceForTeacher | null;
  onClose: () => void;
  onSaved: (race: RaceForTeacher) => void;
}>) {
  const { authorizedFetch, executionFetch } = useAuth();
  const [title, setTitle] = useState(race?.title ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    race?.durationMinutes ?? 120,
  );
  const [opensAt, setOpensAt] = useState(() =>
    localDateTimeValue(race ? new Date(race.opensAt) : new Date()),
  );
  const [closesAt, setClosesAt] = useState(() =>
    localDateTimeValue(
      race ? new Date(race.closesAt) : new Date(Date.now() + 24 * 60 * 60_000),
    ),
  );
  const [problems, setProblems] = useState<readonly ProblemDraft[]>(
    race && race.problems.length > 0
      ? race.problems.map((problem, index) =>
          problemToDraft(problem, `problem-${index}`),
        )
      : [newProblem("problem-1")],
  );
  const [activeProblemIndex, setActiveProblemIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateProblem(key: string, changes: Partial<ProblemDraft>) {
    setProblems((current) =>
      current.map((problem) =>
        problem.key === key ? { ...problem, ...changes } : problem,
      ),
    );
  }

  function updateTestCase(
    problemKey: string,
    index: number,
    changes: Partial<TestCaseDraft>,
  ) {
    setProblems((current) =>
      current.map((problem) =>
        problem.key === problemKey
          ? {
              ...problem,
              testCases: problem.testCases.map((testCase, position) =>
                position === index ? { ...testCase, ...changes } : testCase,
              ),
            }
          : problem,
      ),
    );
  }

  // Drafts one problem's title/instructions/starter code/reference
  // solution/test cases from its own brief — reuses execution-api's
  // /v1/activities/generate endpoint as-is (it's already generic over
  // language/difficulty/topic, no activityId involved), the same way
  // ActivityFormDialog does. Never posts anything; the teacher still
  // reviews before saving the whole race.
  async function generateProblem(problemKey: string) {
    const problem = problems.find((entry) => entry.key === problemKey);
    if (!problem || !problem.topic.trim()) return;
    updateProblem(problemKey, {
      generating: true,
      generateError: null,
      verifyResults: null,
    });
    try {
      const response = await executionFetch("/v1/activities/generate", {
        method: "POST",
        body: JSON.stringify({
          topic: problem.topic,
          language: problem.language,
          difficulty: problem.difficulty,
          testCaseCount: problem.generateTestCaseCount,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          errorMessageFrom(payload, "The problem could not be generated."),
        );
      }
      const draft = activityGenerateResponseSchema.parse(await response.json());
      updateProblem(problemKey, {
        title: draft.title,
        instructions: draft.instructions,
        starterCode: draft.starterCode ?? "",
        referenceSolution: draft.referenceSolution,
        testCases: draft.testCases.map((testCase) => ({
          stdin: testCase.stdin,
          expectedStdout: testCase.expectedStdout,
          isHidden: testCase.isHidden,
          showExpectedOutput: !testCase.isHidden,
        })),
        verifyResults: draft.verification.results,
      });
    } catch (generateErr) {
      updateProblem(problemKey, {
        generateError:
          generateErr instanceof Error
            ? generateErr.message
            : "The problem could not be generated.",
      });
    } finally {
      updateProblem(problemKey, { generating: false });
    }
  }

  async function verifyProblem(problemKey: string) {
    const problem = problems.find((entry) => entry.key === problemKey);
    if (!problem || !problem.referenceSolution.trim()) return;
    updateProblem(problemKey, { verifying: true, verifyError: null });
    try {
      const response = await executionFetch("/v1/activities/verify-reference", {
        method: "POST",
        body: JSON.stringify({
          language: problem.language,
          comparisonMode: problem.comparisonMode,
          numericTolerance:
            problem.comparisonMode === "numeric"
              ? problem.numericTolerance
              : null,
          referenceSolution: problem.referenceSolution,
          testCases: problem.testCases.map((testCase) => ({
            stdin: testCase.stdin,
            expectedStdout: testCase.expectedStdout,
          })),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          errorMessageFrom(
            payload,
            "The reference solution could not be checked.",
          ),
        );
      }
      const result = activityVerifyReferenceResponseSchema.parse(
        await response.json(),
      );
      updateProblem(problemKey, { verifyResults: result.results });
    } catch (verifyErr) {
      updateProblem(problemKey, {
        verifyError:
          verifyErr instanceof Error
            ? verifyErr.message
            : "The reference solution could not be checked.",
      });
    } finally {
      updateProblem(problemKey, { verifying: false });
    }
  }

  const totalPoints = problems.reduce(
    (total, problem) => total + (problem.points || 0),
    0,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const problemsPayload = problems.map((problem) => ({
        title: problem.title,
        instructions: problem.instructions,
        language: problem.language,
        starterCode: problem.starterCode || undefined,
        referenceSolution: problem.referenceSolution || undefined,
        comparisonMode: problem.comparisonMode,
        numericTolerance:
          problem.comparisonMode === "numeric"
            ? problem.numericTolerance
            : undefined,
        points: problem.points,
        testCases: problem.testCases.map((testCase) => ({
          stdin: testCase.stdin,
          expectedStdout: testCase.expectedStdout,
          isHidden: testCase.isHidden,
          showExpectedOutput: testCase.showExpectedOutput,
        })),
      }));
      const response = await authorizedFetch(
        race ? `/v1/races/${race.id}` : `/v1/classes/${classId}/races`,
        {
          method: race ? "PATCH" : "POST",
          body: JSON.stringify(
            race
              ? { title, durationMinutes, problems: problemsPayload }
              : {
                  title,
                  durationMinutes,
                  opensAt: new Date(opensAt).toISOString(),
                  closesAt: new Date(closesAt).toISOString(),
                  problems: problemsPayload,
                },
          ),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The Code Racing quiz could not be saved.",
        );
      }
      onSaved(raceForTeacherSchema.parse(await response.json()));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The Code Racing quiz could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-race-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-end p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
    >
      <div
        className="border-structural bg-elevated rounded-panel flex max-h-[92vh] w-full max-w-3xl flex-col border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-center justify-between gap-4 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-control border-divider bg-surface text-action-soft grid size-9 shrink-0 place-items-center border">
              <Flag aria-hidden="true" size={17} />
            </span>
            <h2
              id="create-race-title"
              className="text-ink-primary font-semibold"
            >
              {race ? "Edit Code Racing quiz" : "New Code Racing quiz"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-ink-muted hover:text-ink-primary grid size-8 shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="flex-1 space-y-5 overflow-y-auto p-5"
        >
          <label className="text-ink-muted block text-[11px]">
            Title
            <input
              required
              maxLength={160}
              placeholder="Code Quiz #1"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 text-sm"
            />
          </label>

          <div
            className={`grid gap-3 ${race ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}
          >
            <label className="text-ink-muted text-[11px]">
              Duration (minutes)
              <input
                required
                type="number"
                min={1}
                max={480}
                value={durationMinutes}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (!Number.isNaN(value)) setDurationMinutes(value);
                }}
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 text-sm"
              />
            </label>
            {race ? null : (
              <>
                <label className="text-ink-muted text-[11px]">
                  Opens
                  <input
                    required
                    type="datetime-local"
                    value={opensAt}
                    onChange={(event) => setOpensAt(event.target.value)}
                    className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 text-sm"
                  />
                </label>
                <label className="text-ink-muted text-[11px]">
                  Closes
                  <input
                    required
                    type="datetime-local"
                    value={closesAt}
                    onChange={(event) => setClosesAt(event.target.value)}
                    className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 text-sm"
                  />
                </label>
              </>
            )}
          </div>
          {race ? (
            <p className="text-ink-muted border-divider bg-panel rounded-control border p-2 text-[11px]">
              To change the open/close schedule, use Extend or Reopen on the
              quiz page instead — editing here only changes the title, duration,
              and problems.
            </p>
          ) : null}

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-ink-primary text-sm font-semibold">
                Problems · {totalPoints} pts total
              </legend>
              <button
                type="button"
                onClick={() => {
                  setProblems((current) => [
                    ...current,
                    newProblem(`problem-${Date.now()}`),
                  ]);
                  setActiveProblemIndex(problems.length);
                }}
                className="text-action-soft flex items-center gap-1 text-xs"
              >
                <Plus aria-hidden="true" size={13} /> Add problem
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {problems.map((problem, index) => (
                <button
                  key={problem.key}
                  type="button"
                  onClick={() => setActiveProblemIndex(index)}
                  className={`rounded-control max-w-[220px] truncate px-3 py-1.5 text-xs font-medium ${
                    index === activeProblemIndex
                      ? "bg-action text-white"
                      : "border-divider bg-surface text-ink-secondary hover:bg-elevated border"
                  }`}
                >
                  Problem {index + 1}
                  {problem.title ? `: ${problem.title}` : ""}
                </button>
              ))}
            </div>

            {problems.map((problem, problemIndex) =>
              problemIndex === activeProblemIndex ? (
                <div
                  key={problem.key}
                  className="border-divider bg-panel rounded-panel space-y-3 border p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-ink-secondary text-xs font-medium">
                      Problem {problemIndex + 1}
                    </p>
                    {problems.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove problem ${problemIndex + 1}`}
                        onClick={() => {
                          setProblems((current) =>
                            current.filter(
                              (entry) => entry.key !== problem.key,
                            ),
                          );
                          setActiveProblemIndex((current) =>
                            Math.min(current, problems.length - 2),
                          );
                        }}
                        className="text-ink-muted hover:text-danger"
                      >
                        <Trash2 aria-hidden="true" size={14} />
                      </button>
                    ) : null}
                  </div>

                  <div className="border-action/30 bg-action/5 rounded-control space-y-2 border p-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles
                        aria-hidden="true"
                        size={13}
                        className="text-action-soft"
                      />
                      <h4 className="text-ink-primary text-[10px] font-semibold tracking-[0.02em]">
                        Generate with AI (optional)
                      </h4>
                    </div>
                    <label className="text-ink-muted block text-[11px]">
                      Topic / brief
                      <textarea
                        rows={3}
                        maxLength={8_000}
                        value={problem.topic}
                        onChange={(event) =>
                          updateProblem(problem.key, {
                            topic: event.target.value,
                          })
                        }
                        placeholder='A short topic (e.g. "Read two integers and print their sum") or a full spec — both work.'
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-xs"
                      />
                    </label>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-ink-muted block text-[10px]">
                        Difficulty
                        <select
                          value={problem.difficulty}
                          onChange={(event) =>
                            updateProblem(problem.key, {
                              difficulty: event.target
                                .value as ActivityGenerateRequest["difficulty"],
                            })
                          }
                          className="border-structural bg-canvas text-ink-primary rounded-control mt-1 min-h-8 border px-2 text-xs"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </label>
                      <label className="text-ink-muted block text-[10px]">
                        Test cases
                        <input
                          type="number"
                          min={2}
                          max={10}
                          value={problem.generateTestCaseCount}
                          onChange={(event) => {
                            const value = event.target.valueAsNumber;
                            if (!Number.isNaN(value))
                              updateProblem(problem.key, {
                                generateTestCaseCount: value,
                              });
                          }}
                          className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-16 border px-2 py-1.5 text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={problem.generating || !problem.topic.trim()}
                        onClick={() => void generateProblem(problem.key)}
                        className="rounded-control bg-action hover:bg-action/90 ml-auto flex min-h-8 items-center gap-1.5 px-3 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {problem.generating ? (
                          <Spinner size={12} />
                        ) : (
                          <Sparkles aria-hidden="true" size={12} />
                        )}
                        {problem.generating ? "Generating…" : "Generate"}
                      </button>
                    </div>
                    {problem.generateError ? (
                      <p className="text-danger text-[11px]">
                        {problem.generateError}
                      </p>
                    ) : null}
                    {problem.generating ? (
                      <p className="text-action-soft text-[11px]">
                        Thinking through your brief — this can take up to about
                        2 minutes, please keep this open.
                      </p>
                    ) : null}
                  </div>

                  <label className="text-ink-muted block text-[11px]">
                    Title
                    <input
                      required
                      maxLength={160}
                      value={problem.title}
                      onChange={(event) =>
                        updateProblem(problem.key, {
                          title: event.target.value,
                        })
                      }
                      className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
                    />
                  </label>

                  <div>
                    <p className="text-ink-muted text-[11px]">Instructions</p>
                    <InstructionsEditor
                      required
                      rows={3}
                      maxLength={20_000}
                      value={problem.instructions}
                      onChange={(next) =>
                        updateProblem(problem.key, { instructions: next })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <label className="text-ink-muted text-[11px]">
                      Language
                      <select
                        value={problem.language}
                        onChange={(event) =>
                          updateProblem(problem.key, {
                            language: event.target.value as CodeLanguage,
                          })
                        }
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 ml-2 border px-2 py-1.5 text-xs"
                      >
                        {languages.map((language) => (
                          <option key={language} value={language}>
                            {language}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-ink-muted text-[11px]">
                      Points
                      <input
                        required
                        type="number"
                        min={1}
                        max={1_000}
                        value={problem.points}
                        onChange={(event) => {
                          const value = event.target.valueAsNumber;
                          if (!Number.isNaN(value))
                            updateProblem(problem.key, { points: value });
                        }}
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 ml-2 w-20 border px-2 py-1.5 text-xs"
                      />
                    </label>
                    <label className="text-ink-muted text-[11px]">
                      Output comparison
                      <select
                        value={problem.comparisonMode}
                        onChange={(event) =>
                          updateProblem(problem.key, {
                            comparisonMode: event.target
                              .value as ActivityComparisonMode,
                          })
                        }
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 ml-2 border px-2 py-1.5 text-xs"
                      >
                        {comparisonModes.map((mode) => (
                          <option key={mode} value={mode}>
                            {comparisonModeLabel[mode]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {problem.comparisonMode === "numeric" ? (
                      <label className="text-ink-muted text-[11px]">
                        Tolerance
                        <input
                          required
                          type="number"
                          min="0.000001"
                          step="any"
                          value={problem.numericTolerance}
                          onChange={(event) => {
                            const value = event.target.valueAsNumber;
                            if (!Number.isNaN(value))
                              updateProblem(problem.key, {
                                numericTolerance: value,
                              });
                          }}
                          className="border-structural bg-canvas text-ink-primary rounded-control mt-1 ml-2 w-24 border px-2 py-1.5 text-xs"
                        />
                      </label>
                    ) : null}
                  </div>

                  <label className="text-ink-muted block text-[11px]">
                    Starter code (optional)
                    <textarea
                      rows={3}
                      value={problem.starterCode}
                      onChange={(event) =>
                        updateProblem(problem.key, {
                          starterCode: event.target.value,
                        })
                      }
                      className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 font-mono text-xs"
                    />
                  </label>

                  <div className="border-divider bg-elevated rounded-control space-y-2 border p-2.5">
                    <label className="text-ink-muted block text-[11px]">
                      Reference solution (optional — used to verify your answer
                      key)
                      <textarea
                        rows={4}
                        value={problem.referenceSolution}
                        onChange={(event) => {
                          updateProblem(problem.key, {
                            referenceSolution: event.target.value,
                            verifyResults: null,
                          });
                        }}
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 font-mono text-xs"
                      />
                    </label>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-ink-muted text-[10px] leading-4">
                        Checks this problem&apos;s answer key against its test
                        cases below.
                      </p>
                      <button
                        type="button"
                        disabled={
                          problem.verifying || !problem.referenceSolution.trim()
                        }
                        onClick={() => void verifyProblem(problem.key)}
                        className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-7 shrink-0 items-center gap-1.5 border px-2.5 text-[10px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {problem.verifying ? (
                          <Spinner size={11} />
                        ) : (
                          <TestTube2 aria-hidden="true" size={11} />
                        )}
                        {problem.verifying ? "Verifying…" : "Verify"}
                      </button>
                    </div>
                    {problem.verifyError ? (
                      <p className="text-danger text-[11px]">
                        {problem.verifyError}
                      </p>
                    ) : null}
                    {problem.verifyResults ? (
                      <ul className="space-y-1">
                        {problem.verifyResults.map((result) => (
                          <li
                            key={result.index}
                            className={`rounded-control border px-2.5 py-1.5 text-[11px] ${
                              result.passed
                                ? "border-success/30 bg-success/5 text-success"
                                : "border-danger/30 bg-danger/5 text-danger"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {result.passed ? (
                                <Check aria-hidden="true" size={12} />
                              ) : (
                                <X aria-hidden="true" size={12} />
                              )}
                              <span>Test case {result.index + 1}</span>
                              <span className="ml-auto text-[10px]">
                                {result.status}
                              </span>
                            </div>
                            {!result.passed && result.message ? (
                              <p className="mt-1 pl-5 leading-4">
                                {result.message}
                              </p>
                            ) : null}
                            {result.status === "wrong_answer" ? (
                              <p className="mt-1 pl-5 font-mono text-[10px] leading-4 whitespace-pre-wrap">
                                Received: {result.actualStdout || "(no output)"}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-ink-muted text-[11px]">
                        Test cases (input → expected output)
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          updateProblem(problem.key, {
                            testCases: [
                              ...problem.testCases,
                              {
                                stdin: "",
                                expectedStdout: "",
                                isHidden: true,
                                showExpectedOutput: false,
                              },
                            ],
                          })
                        }
                        className="text-action-soft flex items-center gap-1 text-[11px]"
                      >
                        <Plus aria-hidden="true" size={12} />
                        Add test case
                      </button>
                    </div>
                    {problem.testCases.every(
                      (testCase) => !testCase.isHidden,
                    ) ? (
                      <p className="border-warning/30 bg-warning/5 text-warning rounded-control flex items-start gap-1.5 border px-2.5 py-2 text-[11px] leading-4">
                        <CircleAlert
                          aria-hidden="true"
                          size={13}
                          className="mt-0.5 shrink-0"
                        />
                        No hidden test cases — this problem is easy to pass by
                        hardcoding output. Consider marking one hidden.
                      </p>
                    ) : null}
                    {problem.testCases.map((testCase, index) => (
                      <div
                        key={index}
                        className="border-divider bg-elevated rounded-control grid grid-cols-2 gap-2 border p-2.5"
                      >
                        <label className="text-ink-muted col-span-2 flex items-center justify-between text-[10px]">
                          Test case {index + 1}
                          {problem.testCases.length > 1 ? (
                            <button
                              type="button"
                              aria-label={`Remove test case ${index + 1}`}
                              onClick={() =>
                                updateProblem(problem.key, {
                                  testCases: problem.testCases.filter(
                                    (_, position) => position !== index,
                                  ),
                                })
                              }
                              className="text-ink-muted hover:text-danger"
                            >
                              <Trash2 aria-hidden="true" size={12} />
                            </button>
                          ) : null}
                        </label>
                        <div className="col-span-2 flex flex-wrap items-center gap-4">
                          <label className="text-ink-secondary flex items-center gap-2 text-[11px]">
                            <input
                              type="checkbox"
                              checked={testCase.isHidden}
                              onChange={(event) =>
                                updateTestCase(problem.key, index, {
                                  isHidden: event.target.checked,
                                  showExpectedOutput: event.target.checked
                                    ? false
                                    : testCase.showExpectedOutput,
                                })
                              }
                            />
                            Hidden (input and answer are private)
                          </label>
                          {!testCase.isHidden ? (
                            <label className="text-ink-secondary flex items-center gap-2 text-[11px]">
                              <input
                                type="checkbox"
                                checked={testCase.showExpectedOutput}
                                onChange={(event) =>
                                  updateTestCase(problem.key, index, {
                                    showExpectedOutput: event.target.checked,
                                  })
                                }
                              />
                              Show expected output as a sample
                            </label>
                          ) : null}
                        </div>
                        <label className="text-ink-muted text-[10px]">
                          Stdin
                          <textarea
                            rows={2}
                            value={testCase.stdin}
                            onChange={(event) =>
                              updateTestCase(problem.key, index, {
                                stdin: event.target.value,
                              })
                            }
                            className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2 py-1 font-mono text-xs"
                          />
                        </label>
                        <label className="text-ink-muted text-[10px]">
                          Expected stdout
                          <textarea
                            rows={2}
                            value={testCase.expectedStdout}
                            onChange={(event) =>
                              updateTestCase(problem.key, index, {
                                expectedStdout: event.target.value,
                              })
                            }
                            className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2 py-1 font-mono text-xs"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </fieldset>

          {error ? <IdentityStatus tone="error">{error}</IdentityStatus> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="text-ink-muted rounded-control px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Spinner size={14} /> : null}
              {busy
                ? race
                  ? "Saving…"
                  : "Posting…"
                : race
                  ? "Save changes"
                  : "Post Code Racing quiz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
