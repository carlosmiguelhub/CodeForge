"use client";

import {
  codeLanguageMeta,
  codeLanguageSchema,
  quizForTeacherSchema,
  quizGenerateResponseSchema,
  quizTypeSchema,
  type CodeLanguage,
  type QuizForTeacher,
  type QuizGenerateRequest,
  type QuizType,
} from "@sqweb/contracts";
import { ClipboardList, Plus, Sparkles, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";

import { InstructionsEditor } from "./instructions-editor";

const languages = codeLanguageSchema.options;

// Appends field-level detail when the server sent it, same helper as
// activity-form-dialog.tsx's.
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

// A single draft shape covers all three question types — `language` is
// only meaningful (and only sent) for code_choice, `options` only for
// mcq/code_choice. Keeping one flat draft shape (rather than a
// discriminated union) makes toggling a question's type in place a plain
// field update instead of a reconstruction.
interface QuestionDraft {
  key: string;
  questionText: string;
  questionType: "mcq" | "short_answer" | "code_choice";
  language: CodeLanguage;
  options: readonly string[];
  correctAnswer: string;
  points: number;
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

// Lecture quizzes default a fresh question to mcq; Code quizzes only ever
// author code_choice questions — there's no per-question type toggle in
// Code mode. Points default to 1, teacher-adjustable either way.
function newQuestion(key: string, quizType: QuizType): QuestionDraft {
  return {
    key,
    questionText: "",
    questionType: quizType === "code" ? "code_choice" : "mcq",
    language: "python",
    options: ["", ""],
    correctAnswer: "",
    points: 1,
  };
}

function draftFromQuestion(
  question: QuizForTeacher["questions"][number],
  key: string,
): QuestionDraft {
  return {
    key,
    questionText: question.questionText,
    questionType: question.questionType,
    language: question.language ?? "python",
    options: question.options ?? ["", ""],
    correctAnswer: question.correctAnswer,
    points: question.points,
  };
}

// classId/onSaved cover both create (new quiz, posted immediately under
// this class) and edit (existing quiz, `quiz` supplied) — same single-
// dialog-does-both-modes precedent as ActivityFormDialog/RaceFormDialog.
// Edit never touches opensAt/closesAt/status (the teacher's separate
// Extend/Reopen control) or quizType (immutable after creation, so a
// quiz's authored question format can never drift from what its
// workspace/preview rendering expects).
export function QuizFormDialog({
  classId,
  quiz,
  onClose,
  onSaved,
}: Readonly<{
  classId: string;
  quiz?: QuizForTeacher | null;
  onClose: () => void;
  onSaved: (quiz: QuizForTeacher) => void;
}>) {
  const { authorizedFetch, executionFetch } = useAuth();
  const [title, setTitle] = useState(quiz?.title ?? "");
  const [quizType, setQuizType] = useState<QuizType>(
    quiz?.quizType ?? "lecture",
  );
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] =
    useState<QuizGenerateRequest["difficulty"]>("beginner");
  const [generateLanguage, setGenerateLanguage] =
    useState<CodeLanguage>("python");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(
    quiz?.durationMinutes ?? 30,
  );
  const [opensAt, setOpensAt] = useState(() =>
    localDateTimeValue(quiz ? new Date(quiz.opensAt) : new Date()),
  );
  const [closesAt, setClosesAt] = useState(() =>
    localDateTimeValue(
      quiz ? new Date(quiz.closesAt) : new Date(Date.now() + 24 * 60 * 60_000),
    ),
  );
  const [questions, setQuestions] = useState<readonly QuestionDraft[]>(
    quiz && quiz.questions.length > 0
      ? quiz.questions.map((question, index) =>
          draftFromQuestion(question, `question-${index}`),
        )
      : [newQuestion("question-1", quizType)],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(key: string, changes: Partial<QuestionDraft>) {
    setQuestions((current) =>
      current.map((question) =>
        question.key === key ? { ...question, ...changes } : question,
      ),
    );
  }

  function updateOption(question: QuestionDraft, index: number, value: string) {
    const oldValue = question.options[index];
    const options = question.options.map((option, position) =>
      position === index ? value : option,
    );
    updateQuestion(question.key, {
      options,
      correctAnswer:
        question.correctAnswer === oldValue ? value : question.correctAnswer,
    });
  }

  // Drafts a whole question set from a brief via an LLM — the AI decides
  // how many questions to generate based on the brief's scope, there's no
  // teacher-specified count. Never auto-saves; replaces the current draft
  // questions wholesale so the teacher always reviews/edits before saving.
  // Reuses execution-api's /v1/quizzes/generate endpoint, the same way
  // ActivityFormDialog/RaceFormDialog call /v1/activities/generate.
  async function generateWithAi() {
    if (!topic.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await executionFetch("/v1/quizzes/generate", {
        method: "POST",
        body: JSON.stringify({
          topic,
          quizType,
          language: quizType === "code" ? generateLanguage : undefined,
          difficulty,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          errorMessageFrom(payload, "The quiz could not be generated."),
        );
      }
      const draft = quizGenerateResponseSchema.parse(await response.json());
      setTitle(draft.title);
      setQuestions(
        draft.questions.map((question, index) => ({
          key: `generated-${index}`,
          questionText: question.questionText,
          questionType: quizType === "code" ? "code_choice" : "mcq",
          language: generateLanguage,
          options: question.options,
          correctAnswer: question.correctAnswer,
          points: 1,
        })),
      );
    } catch (generateErr) {
      setGenerateError(
        generateErr instanceof Error
          ? generateErr.message
          : "The quiz could not be generated.",
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
      const questionsPayload = questions.map((question) => {
        if (question.questionType === "short_answer") {
          return {
            questionText: question.questionText,
            questionType: "short_answer" as const,
            correctAnswer: question.correctAnswer,
            points: question.points,
          };
        }
        if (question.questionType === "code_choice") {
          return {
            questionText: question.questionText,
            questionType: "code_choice" as const,
            language: question.language,
            options: question.options,
            correctAnswer: question.correctAnswer,
            points: question.points,
          };
        }
        return {
          questionText: question.questionText,
          questionType: "mcq" as const,
          options: question.options,
          correctAnswer: question.correctAnswer,
          points: question.points,
        };
      });
      const response = await authorizedFetch(
        quiz ? `/v1/quizzes/${quiz.id}` : `/v1/classes/${classId}/quizzes`,
        {
          method: quiz ? "PATCH" : "POST",
          body: JSON.stringify(
            quiz
              ? { title, durationMinutes, questions: questionsPayload }
              : {
                  title,
                  quizType,
                  durationMinutes,
                  opensAt: new Date(opensAt).toISOString(),
                  closesAt: new Date(closesAt).toISOString(),
                  questions: questionsPayload,
                },
          ),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The quiz could not be saved.",
        );
      }
      onSaved(quizForTeacherSchema.parse(await response.json()));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The quiz could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-form-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-end p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
    >
      <div
        className="border-structural bg-elevated rounded-panel flex max-h-[92vh] w-full max-w-2xl flex-col border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-center justify-between gap-4 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-control border-divider bg-surface text-action-soft grid size-9 place-items-center border">
              <ClipboardList aria-hidden="true" size={17} />
            </span>
            <h2 id="quiz-form-title" className="text-ink-primary font-semibold">
              {quiz
                ? "Edit quiz"
                : quizType === "code"
                  ? "New Code Quiz"
                  : "New Lecture Quiz"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-ink-muted hover:text-ink-primary grid size-8 place-items-center disabled:cursor-not-allowed disabled:opacity-40"
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
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 text-sm"
            />
          </label>

          {quiz ? (
            <p className="text-ink-muted text-[11px]">
              Quiz type
              <span className="text-ink-primary border-divider bg-panel rounded-control ml-2 border px-2 py-1 text-xs font-medium">
                {quiz.quizType === "code" ? "Code Quiz" : "Lecture Quiz"}
              </span>
            </p>
          ) : (
            <fieldset className="space-y-1.5">
              <legend className="text-ink-muted text-[11px]">Quiz type</legend>
              <div className="flex gap-2">
                {quizTypeSchema.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setQuizType(option);
                      setQuestions([
                        newQuestion(`question-${Date.now()}`, option),
                      ]);
                    }}
                    className={`rounded-control flex-1 border px-3 py-2 text-left text-xs font-medium ${
                      quizType === option
                        ? "border-action bg-action/10 text-action-soft"
                        : "border-structural text-ink-secondary hover:border-action/50"
                    }`}
                  >
                    {option === "code" ? "Code Quiz" : "Lecture Quiz"}
                    <span className="text-ink-muted mt-0.5 block text-[10px] font-normal">
                      {option === "code"
                        ? "Question and choices are code snippets."
                        : "Google-Forms-style multiple choice & short answer."}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

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
                rows={4}
                maxLength={8_000}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={
                  quizType === "code"
                    ? 'A short topic (e.g. "Python list comprehensions") — the AI decides how many code-choice questions to write.'
                    : 'A short topic (e.g. "Photosynthesis basics") — the AI decides how many questions to write.'
                }
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
                      event.target.value as QuizGenerateRequest["difficulty"],
                    )
                  }
                  className="border-structural bg-canvas text-ink-primary rounded-control mt-1 min-h-9 border px-2.5 text-sm"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
              {quizType === "code" ? (
                <label className="text-ink-muted block text-[11px]">
                  Language
                  <select
                    value={generateLanguage}
                    onChange={(event) =>
                      setGenerateLanguage(event.target.value as CodeLanguage)
                    }
                    className="border-structural bg-canvas text-ink-primary rounded-control mt-1 min-h-9 border px-2.5 text-sm"
                  >
                    {languages.map((language) => (
                      <option key={language} value={language}>
                        {codeLanguageMeta[language].label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
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
                minutes, please keep this open.
              </p>
            ) : null}
            <p className="text-ink-muted text-[10px] leading-4">
              Replaces the questions below with a fresh set drafted from your
              brief — the AI decides how many to write. Always review and edit
              before saving.
            </p>
          </div>

          <div
            className={`grid gap-3 ${quiz ? "sm:grid-cols-1" : "sm:grid-cols-3"}`}
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
            {quiz ? null : (
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

          <fieldset className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-ink-primary text-sm font-semibold">
                Questions
              </legend>
              <button
                type="button"
                onClick={() =>
                  setQuestions((current) => [
                    ...current,
                    newQuestion(`question-${Date.now()}`, quizType),
                  ])
                }
                className="text-action-soft flex items-center gap-1 text-xs"
              >
                <Plus aria-hidden="true" size={13} /> Add question
              </button>
            </div>

            {questions.map((question, index) => (
              <div
                key={question.key}
                className="border-divider bg-panel rounded-panel space-y-3 border p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-ink-secondary text-xs font-medium">
                    Question {index + 1}
                  </p>
                  {questions.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() =>
                        setQuestions((current) =>
                          current.filter((entry) => entry.key !== question.key),
                        )
                      }
                      className="text-ink-muted hover:text-danger"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  ) : null}
                </div>

                {quizType === "code" ? (
                  <>
                    <div className="flex flex-wrap gap-3">
                      <label className="text-ink-muted text-[11px]">
                        Language
                        <select
                          value={question.language}
                          onChange={(event) =>
                            updateQuestion(question.key, {
                              language: event.target.value as CodeLanguage,
                            })
                          }
                          className="border-structural bg-canvas text-ink-primary rounded-control ml-2 border px-2 py-1.5 text-xs"
                        >
                          {languages.map((language) => (
                            <option key={language} value={language}>
                              {codeLanguageMeta[language].label}
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
                          max={100}
                          value={question.points}
                          onChange={(event) =>
                            updateQuestion(question.key, {
                              points: event.target.valueAsNumber,
                            })
                          }
                          className="border-structural bg-canvas text-ink-primary rounded-control ml-2 w-20 border px-2 py-1.5 text-xs"
                        />
                      </label>
                    </div>
                    <label className="text-ink-muted block text-[11px]">
                      Question code
                      <textarea
                        required
                        rows={4}
                        maxLength={2000}
                        aria-label={`Question ${index + 1} code`}
                        placeholder={
                          "// e.g. what fills the blank?\nfor (int i = 0; ____; i++) {"
                        }
                        value={question.questionText}
                        onChange={(event) =>
                          updateQuestion(question.key, {
                            questionText: event.target.value,
                          })
                        }
                        className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-2 font-mono text-xs"
                      />
                    </label>
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          className="flex items-start gap-2"
                        >
                          <input
                            type="radio"
                            name={`correct-${question.key}`}
                            checked={
                              option !== "" && question.correctAnswer === option
                            }
                            onChange={() =>
                              updateQuestion(question.key, {
                                correctAnswer: option,
                              })
                            }
                            aria-label={`Mark choice ${optionIndex + 1} correct`}
                            className="mt-2"
                          />
                          <textarea
                            required
                            rows={4}
                            maxLength={2000}
                            value={option}
                            placeholder={`Code choice ${optionIndex + 1}\ne.g.\npublic int getAge() {\n    return age;\n}`}
                            onChange={(event) =>
                              updateOption(
                                question,
                                optionIndex,
                                event.target.value,
                              )
                            }
                            className="border-structural bg-canvas text-ink-primary rounded-control flex-1 border px-2.5 py-1.5 font-mono text-xs"
                          />
                          {question.options.length > 2 ? (
                            <button
                              type="button"
                              aria-label={`Remove choice ${optionIndex + 1}`}
                              onClick={() =>
                                updateQuestion(question.key, {
                                  options: question.options.filter(
                                    (_, position) => position !== optionIndex,
                                  ),
                                  correctAnswer:
                                    question.correctAnswer === option
                                      ? ""
                                      : question.correctAnswer,
                                })
                              }
                              className="text-ink-muted hover:text-danger mt-2"
                            >
                              <X aria-hidden="true" size={13} />
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-ink-muted text-[10px]">
                          Select the radio beside the correct code choice.
                        </p>
                        {question.options.length < 10 ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(question.key, {
                                options: [...question.options, ""],
                              })
                            }
                            className="text-action-soft text-[11px]"
                          >
                            + Add choice
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <InstructionsEditor
                      required
                      rows={2}
                      maxLength={5000}
                      value={question.questionText}
                      onChange={(value) =>
                        updateQuestion(question.key, { questionText: value })
                      }
                    />
                    <div className="flex flex-wrap gap-3">
                      <label className="text-ink-muted text-[11px]">
                        Type
                        <select
                          value={question.questionType}
                          onChange={(event) =>
                            updateQuestion(question.key, {
                              questionType: event.target
                                .value as QuestionDraft["questionType"],
                              correctAnswer: "",
                            })
                          }
                          className="border-structural bg-canvas text-ink-primary rounded-control ml-2 border px-2 py-1.5 text-xs"
                        >
                          <option value="mcq">Multiple choice</option>
                          <option value="short_answer">Short answer</option>
                        </select>
                      </label>
                      <label className="text-ink-muted text-[11px]">
                        Points
                        <input
                          required
                          type="number"
                          min={1}
                          max={100}
                          value={question.points}
                          onChange={(event) =>
                            updateQuestion(question.key, {
                              points: event.target.valueAsNumber,
                            })
                          }
                          className="border-structural bg-canvas text-ink-primary rounded-control ml-2 w-20 border px-2 py-1.5 text-xs"
                        />
                      </label>
                    </div>

                    {question.questionType === "mcq" ? (
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={optionIndex}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="radio"
                              name={`correct-${question.key}`}
                              checked={
                                option !== "" &&
                                question.correctAnswer === option
                              }
                              onChange={() =>
                                updateQuestion(question.key, {
                                  correctAnswer: option,
                                })
                              }
                              aria-label={`Mark option ${optionIndex + 1} correct`}
                            />
                            <input
                              required
                              maxLength={500}
                              value={option}
                              placeholder={`Option ${optionIndex + 1}`}
                              onChange={(event) =>
                                updateOption(
                                  question,
                                  optionIndex,
                                  event.target.value,
                                )
                              }
                              className="border-structural bg-canvas text-ink-primary rounded-control flex-1 border px-2.5 py-1.5 text-xs"
                            />
                            {question.options.length > 2 ? (
                              <button
                                type="button"
                                aria-label={`Remove option ${optionIndex + 1}`}
                                onClick={() =>
                                  updateQuestion(question.key, {
                                    options: question.options.filter(
                                      (_, position) => position !== optionIndex,
                                    ),
                                    correctAnswer:
                                      question.correctAnswer === option
                                        ? ""
                                        : question.correctAnswer,
                                  })
                                }
                                className="text-ink-muted hover:text-danger"
                              >
                                <X aria-hidden="true" size={13} />
                              </button>
                            ) : null}
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-ink-muted text-[10px]">
                            Select the radio beside the correct option.
                          </p>
                          {question.options.length < 10 ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateQuestion(question.key, {
                                  options: [...question.options, ""],
                                })
                              }
                              className="text-action-soft text-[11px]"
                            >
                              + Add option
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <label className="text-ink-muted block text-[11px]">
                        Exact answer
                        <input
                          required
                          maxLength={10000}
                          value={question.correctAnswer}
                          onChange={(event) =>
                            updateQuestion(question.key, {
                              correctAnswer: event.target.value,
                            })
                          }
                          className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-xs"
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            ))}
          </fieldset>

          {error ? <IdentityStatus tone="error">{error}</IdentityStatus> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-ink-muted px-3 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-control bg-action hover:bg-action/90 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Spinner size={14} /> : null}
              {busy ? "Saving…" : quiz ? "Save changes" : "Post quiz"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
