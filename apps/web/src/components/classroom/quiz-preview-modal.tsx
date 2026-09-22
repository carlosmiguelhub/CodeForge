"use client";

import { codeLanguageMeta, type QuizForTeacher } from "@sqweb/contracts";
import { Eye, X } from "lucide-react";

import { CodeSnippet } from "./code-snippet";
import { FormattedInstructions } from "./formatted-instructions";

function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

// Read-only, teacher-only — renders the exact same question layout
// QuizWorkspace shows a student, built entirely from data the teacher
// detail page already has (no attempt, no grading calls). Unlike
// ActivityPreviewModal/RacePreviewModal there's no Monaco editor anywhere
// (Code Quiz choices are plain <pre> blocks, never live editors), so this
// is a single scrolling column with no 3-panel-grid mobile-height gotcha
// to work around.
export function QuizPreviewModal({
  quiz,
  onClose,
}: Readonly<{ quiz: QuizForTeacher; onClose: () => void }>) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-preview-title"
      className="bg-canvas/80 fixed inset-0 z-[70] flex flex-col p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider bg-elevated flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-action-soft border-action/30 bg-action/5 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium">
              <Eye aria-hidden="true" size={12} />
              Preview — student view
            </span>
            <h2
              id="quiz-preview-title"
              className="text-ink-primary truncate text-sm font-semibold"
            >
              {quiz.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="text-ink-muted hover:bg-elevated-high hover:text-ink-primary rounded-control grid size-8 shrink-0 place-items-center"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {quiz.questions.map((question, index) => (
            <div
              key={question.id}
              className="border-structural bg-surface rounded-panel border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="bg-action font-heading grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="text-ink-primary text-sm font-semibold">
                    {quiz.quizType === "code" && question.language
                      ? codeLanguageMeta[question.language].label
                      : "Question"}
                  </p>
                </div>
                <span className="text-ink-muted shrink-0 text-[11px]">
                  {question.points} pts
                </span>
              </div>

              {quiz.quizType === "code" ? (
                <CodeSnippet
                  code={question.questionText}
                  language={
                    question.language
                      ? codeLanguageMeta[question.language].monacoId
                      : "plaintext"
                  }
                  className="border-divider bg-deep rounded-control mt-2 overflow-x-auto border p-3 font-mono text-[11px] leading-5 whitespace-pre"
                />
              ) : (
                <FormattedInstructions
                  text={question.questionText}
                  className="text-ink-primary mt-1 space-y-2 text-sm leading-6"
                />
              )}

              <div className="mt-3 space-y-2">
                {quiz.quizType === "code" ? (
                  (question.options ?? []).map((option, optionIndex) => (
                    <label
                      key={optionIndex}
                      className="border-divider bg-panel rounded-control flex items-start gap-2 border p-2"
                    >
                      <span className="border-divider bg-elevated text-ink-secondary mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold">
                        {optionLetter(optionIndex)}
                      </span>
                      <input type="radio" disabled className="mt-2" />
                      <CodeSnippet
                        code={option}
                        language={
                          question.language
                            ? codeLanguageMeta[question.language].monacoId
                            : "plaintext"
                        }
                        className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-5 whitespace-pre"
                      />
                    </label>
                  ))
                ) : question.options ? (
                  question.options.map((option, optionIndex) => (
                    <label
                      key={option}
                      className="border-divider bg-panel rounded-control flex items-center gap-2 border p-2 text-xs"
                    >
                      <span className="border-divider bg-elevated text-ink-secondary grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold">
                        {optionLetter(optionIndex)}
                      </span>
                      <input type="radio" disabled />
                      <span className="text-ink-secondary">{option}</span>
                    </label>
                  ))
                ) : (
                  <input
                    disabled
                    placeholder="Short answer"
                    className="border-structural bg-canvas text-ink-muted rounded-control w-full border px-2.5 py-1.5 text-xs"
                  />
                )}
              </div>
            </div>
          ))}
          <p className="text-ink-muted border-divider bg-panel rounded-control border p-2 text-center text-[11px]">
            Preview only — starting, answering, and submitting are disabled
            here.
          </p>
        </div>
      </div>
    </div>
  );
}
