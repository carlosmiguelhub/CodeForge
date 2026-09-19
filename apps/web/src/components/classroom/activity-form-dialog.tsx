"use client";

import {
  activityGenerateResponseSchema,
  activitySchema,
  activityVerifyReferenceResponseSchema,
  codeLanguageMeta,
  codeLanguageSchema,
  type Activity,
  type ActivityComparisonMode,
  type ActivityGenerateRequest,
  type ActivityVerifyReferenceResult,
  type CodeLanguage,
} from "@sqweb/contracts";
import {
  Check,
  CircleAlert,
  FileCode2,
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

const languages = codeLanguageSchema.options;

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

interface TestCaseDraft {
  stdin: string;
  expectedStdout: string;
  isHidden: boolean;
  showExpectedOutput: boolean;
}

// Appends field-level detail when the server sent it (see the ZodError
// branch in execution-api's error handler) so a validation failure reads
// as e.g. "The request is invalid. (testCaseCount: Expected number,
// received null)" instead of just a dead-end "invalid".
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

export function ActivityFormDialog({
  classId,
  activity,
  onClose,
  onSaved,
}: Readonly<{
  classId: string;
  activity?: Activity | null;
  onClose: () => void;
  onSaved: (activity: Activity) => void;
}>) {
  const { authorizedFetch, executionFetch } = useAuth();
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] =
    useState<ActivityGenerateRequest["difficulty"]>("beginner");
  const [generateTestCaseCount, setGenerateTestCaseCount] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [title, setTitle] = useState(activity?.title ?? "");
  const [instructions, setInstructions] = useState(
    activity?.instructions ?? "",
  );
  const [language, setLanguage] = useState<CodeLanguage>(
    activity?.language ?? "python",
  );
  const [starterCode, setStarterCode] = useState(activity?.starterCode ?? "");
  const [referenceSolution, setReferenceSolution] = useState(
    activity?.referenceSolution ?? "",
  );
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<
    readonly ActivityVerifyReferenceResult[] | null
  >(null);
  const [allowRetake, setAllowRetake] = useState(
    activity?.allowRetake ?? false,
  );
  // suffix_exact, not normalized_exact, for a brand-new activity — it
  // grades correctly whether or not the program prints an input prompt
  // first, so a teacher who edits expectedStdout (or generates with AI)
  // doesn't also have to remember to flip this dropdown to match.
  const [comparisonMode, setComparisonMode] = useState<ActivityComparisonMode>(
    activity?.comparisonMode ?? "suffix_exact",
  );
  const [numericTolerance, setNumericTolerance] = useState(
    activity?.numericTolerance ?? 0.001,
  );
  const [points, setPoints] = useState(activity?.points ?? 100);
  // Empty string means "no deadline" — matches deadlineAt being nullable
  // both in the request and on the activity itself.
  const [deadlineAt, setDeadlineAt] = useState(
    activity?.deadlineAt
      ? localDateTimeValue(new Date(activity.deadlineAt))
      : "",
  );
  const [testCases, setTestCases] = useState<readonly TestCaseDraft[]>(
    activity?.testCases.map((testCase) => ({
      stdin: testCase.stdin,
      expectedStdout: testCase.expectedStdout,
      isHidden: testCase.isHidden,
      showExpectedOutput: testCase.showExpectedOutput,
    })) ?? [
      {
        stdin: "",
        expectedStdout: "",
        isHidden: false,
        showExpectedOutput: true,
      },
    ],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTestCase(index: number, changes: Partial<TestCaseDraft>) {
    setTestCases((current) =>
      current.map((testCase, position) =>
        position === index ? { ...testCase, ...changes } : testCase,
      ),
    );
  }

  async function verifyReference() {
    if (!referenceSolution.trim() || testCases.length === 0) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const response = await executionFetch("/v1/activities/verify-reference", {
        method: "POST",
        body: JSON.stringify({
          language,
          comparisonMode,
          numericTolerance:
            comparisonMode === "numeric" ? numericTolerance : null,
          referenceSolution,
          testCases: testCases.map((testCase) => ({
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
      setVerifyResults(result.results);
    } catch (checkError) {
      setVerifyError(
        checkError instanceof Error
          ? checkError.message
          : "The reference solution could not be checked.",
      );
    } finally {
      setVerifying(false);
    }
  }

  // Drafts title/instructions/starter code/reference solution/test cases
  // from a short brief, then fills the form with them — never posts
  // anything itself, so the teacher always reviews and edits before
  // saving. Reuses the same verifyResults state the manual "Verify" button
  // uses, since the server already grades the AI's own solution against
  // its own test cases and returns results in the identical shape.
  async function generateWithAi() {
    if (!topic.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    setVerifyResults(null);
    try {
      const response = await executionFetch("/v1/activities/generate", {
        method: "POST",
        body: JSON.stringify({
          topic,
          language,
          difficulty,
          testCaseCount: generateTestCaseCount,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          errorMessageFrom(payload, "The activity could not be generated."),
        );
      }
      const draft = activityGenerateResponseSchema.parse(await response.json());
      setTitle(draft.title);
      setInstructions(draft.instructions);
      setStarterCode(draft.starterCode ?? "");
      setReferenceSolution(draft.referenceSolution);
      setTestCases(
        draft.testCases.map((testCase) => ({
          stdin: testCase.stdin,
          expectedStdout: testCase.expectedStdout,
          isHidden: testCase.isHidden,
          showExpectedOutput: !testCase.isHidden,
        })),
      );
      setVerifyResults(draft.verification.results);
    } catch (generateErr) {
      setGenerateError(
        generateErr instanceof Error
          ? generateErr.message
          : "The activity could not be generated.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await authorizedFetch(
        activity
          ? `/v1/activities/${activity.id}`
          : `/v1/classes/${classId}/activities`,
        {
          method: activity ? "PATCH" : "POST",
          body: JSON.stringify({
            title,
            instructions,
            language,
            starterCode: starterCode || undefined,
            referenceSolution: referenceSolution || undefined,
            allowRetake,
            comparisonMode,
            numericTolerance:
              comparisonMode === "numeric" ? numericTolerance : undefined,
            points,
            deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null,
            testCases,
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          errorMessageFrom(payload, "The activity could not be saved."),
        );
      }
      onSaved(activitySchema.parse(await response.json()));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The activity could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  // A misclick on the backdrop must never discard whatever's typed into
  // this form — it no longer closes the dialog at all. Only the explicit
  // X/Cancel buttons do, and those still respect closeGuarded below so an
  // in-flight AI generation, verification, or save can't be discarded
  // either (those responses land back into this same form's state).
  const closeGuarded = generating || verifying || busy;
  function requestClose() {
    if (closeGuarded) return;
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-activity-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-end p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
    >
      <div
        className="border-structural bg-elevated rounded-panel flex max-h-[92vh] w-full max-w-3xl flex-col border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-center justify-between gap-4 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-control border-divider bg-surface text-action-soft grid size-9 shrink-0 place-items-center border">
              <FileCode2 aria-hidden="true" size={17} strokeWidth={1.7} />
            </span>
            <h2
              id="create-activity-title"
              className="font-heading text-ink-primary text-base font-semibold"
            >
              {activity ? "Edit activity" : "New activity"}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={closeGuarded}
            aria-label="Close"
            className="text-ink-muted hover:bg-elevated-high hover:text-ink-primary rounded-control grid size-8 shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="flex-1 space-y-4 overflow-y-auto p-5"
        >
          <div className="border-action/30 bg-action/5 rounded-control space-y-2 border p-3">
            <div className="flex items-center gap-2">
              <Sparkles
                aria-hidden="true"
                size={14}
                className="text-action-soft"
              />
              <h3 className="text-ink-primary text-[11px] font-semibold tracking-[0.02em]">
                Generate with AI (optional)
              </h3>
            </div>
            <label className="text-ink-muted block text-[11px]">
              Topic / brief
              <textarea
                rows={5}
                maxLength={8_000}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder='A short topic (e.g. "Read two integers and print their sum") or a full spec with exact class names, method signatures, and test case data — both work.'
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
              />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-ink-muted block text-[11px]">
                Difficulty
                <select
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(
                      event.target
                        .value as ActivityGenerateRequest["difficulty"],
                    )
                  }
                  className="border-structural bg-canvas text-ink-primary rounded-control mt-1 min-h-9 border px-2.5 text-sm"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              <label className="text-ink-muted block text-[11px]">
                Test cases
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={generateTestCaseCount}
                  onChange={(event) => {
                    // valueAsNumber is NaN while the field is empty
                    // mid-edit — JSON.stringify would silently turn that
                    // into `null`, which fails server-side validation with
                    // an unhelpful "invalid request" error. Ignore it and
                    // keep the last valid value instead.
                    const value = event.target.valueAsNumber;
                    if (!Number.isNaN(value)) setGenerateTestCaseCount(value);
                  }}
                  className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-20 border px-2.5 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={generating || !topic.trim()}
                onClick={() => void generateWithAi()}
                className="rounded-control bg-action hover:bg-action/90 ml-auto flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? (
                  <Spinner size={13} />
                ) : (
                  <Sparkles aria-hidden="true" size={13} />
                )}
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
            {generateError ? (
              <p className="text-danger text-[11px]">{generateError}</p>
            ) : null}
            {generating ? (
              <p className="text-action-soft text-[11px]">
                Thinking through your brief — this can take up to about 2
                minutes for a detailed spec, please keep this open.
              </p>
            ) : null}
            <p className="text-ink-muted text-[10px] leading-4">
              Fills in the title, instructions, starter code, reference
              solution, and test cases below from your brief, using the language
              selected below — review everything before saving, this never posts
              on its own.
            </p>
          </div>

          <label className="text-ink-muted block text-[11px]">
            Title
            <input
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
            />
          </label>

          <div>
            <p className="text-ink-muted text-[11px]">Instructions</p>
            <InstructionsEditor
              required
              rows={7}
              value={instructions}
              onChange={setInstructions}
            />
            <p className="text-ink-muted mt-1 text-[10px]">
              Select text and click Bold/Underline, or use the list button for
              bullets — students see the formatting, not the markup.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="text-ink-muted block text-[11px]">
              Language
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as CodeLanguage)
                }
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 min-h-9 border px-2.5 text-sm"
              >
                {languages.map((option) => (
                  <option key={option} value={option}>
                    {codeLanguageMeta[option].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-ink-muted block text-[11px]">
              Points
              <input
                required
                type="number"
                min={1}
                max={1000}
                value={points}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (!Number.isNaN(value)) setPoints(value);
                }}
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-24 border px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="text-ink-muted block text-[11px]">
              Deadline (optional)
              <input
                type="datetime-local"
                value={deadlineAt}
                onChange={(event) => setDeadlineAt(event.target.value)}
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 border px-2.5 py-1.5 text-sm"
              />
            </label>
            {deadlineAt ? (
              <button
                type="button"
                onClick={() => setDeadlineAt("")}
                className="text-action-soft pb-2.5 text-[11px] hover:underline"
              >
                Clear deadline
              </button>
            ) : null}
            <label className="flex items-center gap-2 pb-1.5 text-xs">
              <input
                type="checkbox"
                checked={allowRetake}
                onChange={(event) => setAllowRetake(event.target.checked)}
                className="size-4"
              />
              <span className="text-ink-secondary">
                Allow retakes after passing
              </span>
            </label>
          </div>
          <p className="text-ink-muted text-[10px] leading-4">
            Students can no longer test or submit once the deadline passes — you
            can still extend it or reopen the activity afterward from its page.
          </p>

          <div className="border-divider bg-panel rounded-control space-y-2 border p-3">
            <label className="text-ink-muted block text-[11px]">
              Output comparison
              <select
                value={comparisonMode}
                onChange={(event) =>
                  setComparisonMode(
                    event.target.value as ActivityComparisonMode,
                  )
                }
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 text-sm"
              >
                <option value="suffix_exact">
                  Ends with answer key (recommended — prompts allowed)
                </option>
                <option value="normalized_exact">Normalized exact match</option>
                <option value="token">
                  Whitespace-insensitive token match
                </option>
                <option value="numeric">Numeric values with tolerance</option>
              </select>
            </label>
            {comparisonMode === "numeric" ? (
              <label className="text-ink-muted block text-[11px]">
                Absolute tolerance
                <input
                  required
                  type="number"
                  min="0.000001"
                  max="1000000"
                  step="any"
                  value={numericTolerance}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (!Number.isNaN(value)) setNumericTolerance(value);
                  }}
                  className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 text-sm"
                />
              </label>
            ) : null}
            <p className="text-ink-muted text-[10px] leading-4">
              Exact mode ignores line-ending differences, trailing spaces, and
              surrounding blank space. Token mode ignores all whitespace layout.
              Numeric mode compares whitespace-separated numbers using the
              tolerance above. &quot;Ends with&quot; mode only requires the
              output to end with the answer key — use it when the program prints
              an input prompt first, so you don&apos;t have to type that prompt
              into every expected output. Capitalization remains significant.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-ink-muted block text-[11px]">
              Starter code (optional)
              <textarea
                rows={8}
                value={starterCode}
                onChange={(event) => setStarterCode(event.target.value)}
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 font-mono text-xs"
              />
            </label>

            <div className="border-divider bg-panel rounded-control space-y-2 border p-3">
              <label className="text-ink-muted block text-[11px]">
                Reference solution (optional — teacher only)
                <textarea
                  rows={8}
                  value={referenceSolution}
                  onChange={(event) => {
                    setReferenceSolution(event.target.value);
                    setVerifyResults(null);
                  }}
                  className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 font-mono text-xs"
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <p className="text-ink-muted text-[10px] leading-4">
                  Checks your answer key against the test cases below. Never
                  shown to students.
                </p>
                <button
                  type="button"
                  disabled={verifying || !referenceSolution.trim()}
                  onClick={() => void verifyReference()}
                  className="border-divider text-ink-secondary hover:bg-elevated-high rounded-control flex min-h-8 shrink-0 items-center gap-1.5 border px-3 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifying ? (
                    <Spinner size={12} />
                  ) : (
                    <TestTube2 aria-hidden="true" size={12} />
                  )}
                  {verifying ? "Verifying…" : "Verify"}
                </button>
              </div>
              {verifyError ? (
                <p className="text-danger text-[11px]">{verifyError}</p>
              ) : null}
              {verifyResults ? (
                <ul className="space-y-1">
                  {verifyResults.map((result) => (
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
                        <p className="mt-1 pl-5 leading-4">{result.message}</p>
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
          </div>

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between">
              <legend className="text-ink-muted text-[11px]">
                Test cases (input → expected output)
              </legend>
              <button
                type="button"
                onClick={() =>
                  setTestCases((current) => [
                    ...current,
                    {
                      stdin: "",
                      expectedStdout: "",
                      isHidden: true,
                      showExpectedOutput: false,
                    },
                  ])
                }
                className="text-action-soft flex items-center gap-1 text-[11px]"
              >
                <Plus aria-hidden="true" size={12} />
                Add test case
              </button>
            </div>
            <p className="text-ink-muted text-[10px] leading-4">
              Expected stdout is the answer key: enter only what a correct
              program should print. Prompts such as “Enter a number:” count as
              output. Add normal, boundary, zero, and negative cases where they
              apply.
            </p>
            {testCases.every((testCase) => !testCase.isHidden) ? (
              <p className="border-warning/30 bg-warning/5 text-warning rounded-control flex items-start gap-1.5 border px-2.5 py-2 text-[11px] leading-4">
                <CircleAlert
                  aria-hidden="true"
                  size={13}
                  className="mt-0.5 shrink-0"
                />
                No hidden test cases — every input and expected output is
                visible to students, which makes this activity easy to pass by
                hardcoding output instead of writing real logic. Consider
                marking at least one test case hidden, with different input than
                the visible ones.
              </p>
            ) : null}
            {testCases.map((testCase, index) => (
              <div
                key={index}
                className="border-divider bg-panel rounded-control grid grid-cols-2 gap-2 border p-2.5"
              >
                <label className="text-ink-muted col-span-2 flex items-center justify-between text-[10px]">
                  Test case {index + 1}
                  {testCases.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove test case ${index + 1}`}
                      onClick={() =>
                        setTestCases((current) =>
                          current.filter((_, position) => position !== index),
                        )
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
                        updateTestCase(index, {
                          isHidden: event.target.checked,
                          showExpectedOutput: event.target.checked
                            ? false
                            : testCase.showExpectedOutput,
                        })
                      }
                    />
                    Hidden test (input and answer are private)
                  </label>
                  {!testCase.isHidden ? (
                    <label className="text-ink-secondary flex items-center gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={testCase.showExpectedOutput}
                        onChange={(event) =>
                          updateTestCase(index, {
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
                      updateTestCase(index, { stdin: event.target.value })
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
                      updateTestCase(index, {
                        expectedStdout: event.target.value,
                      })
                    }
                    className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2 py-1 font-mono text-xs"
                  />
                  <span className="mt-1 block leading-4">
                    Leave empty when the correct program should print nothing.
                  </span>
                </label>
              </div>
            ))}
          </fieldset>

          {error ? <IdentityStatus tone="error">{error}</IdentityStatus> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={requestClose}
              disabled={closeGuarded}
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
              {activity
                ? busy
                  ? "Saving…"
                  : "Save changes"
                : busy
                  ? "Posting…"
                  : "Post activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
