"use client";

import { codeLanguageMeta, type RaceForTeacher } from "@sqweb/contracts";
import { Eye, FileCode2, TestTube2, X } from "lucide-react";
import { useState } from "react";

import { CodeEditor } from "@/components/code-workbench/code-editor";

import { FormattedInstructions } from "./formatted-instructions";

const comparisonHelp = {
  normalized_exact:
    "Output must match the answer key. Trailing spaces, surrounding blank space, and Windows/Linux line endings are ignored.",
  token:
    "Output words and values must match in order. Spaces and line breaks between them are ignored.",
  numeric:
    "Output must contain the expected numeric values in order. Small differences within the configured tolerance are accepted.",
  suffix_exact:
    "Output must end with the answer key exactly. Anything printed before that (like an input prompt) is allowed.",
} as const;

// Read-only, teacher-only — renders the exact same problem/editor/tests
// layout RaceWorkspace shows a student, built entirely from data the
// teacher detail page already has (no attempt, no grading calls). Same
// pattern as ActivityPreviewModal, plus a problem switcher since a race
// bundles several problems under one attempt. The editor's onChange is a
// no-op instead of threading a real readOnly prop through the shared
// CodeEditor, so nothing here can accidentally start, run, or submit.
export function RacePreviewModal({
  race,
  onClose,
}: Readonly<{ race: RaceForTeacher; onClose: () => void }>) {
  const [problemIndex, setProblemIndex] = useState(0);
  const problem = race.problems[problemIndex];
  const visibleTestCases =
    problem?.testCases.filter((testCase) => !testCase.isHidden) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="race-preview-title"
      className="bg-canvas/80 fixed inset-0 z-[70] flex flex-col p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider bg-elevated flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-action-soft border-action/30 bg-action/5 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium">
              <Eye aria-hidden="true" size={12} />
              Preview — student view
            </span>
            <h2
              id="race-preview-title"
              className="text-ink-primary truncate text-sm font-semibold"
            >
              {race.title}
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

        {race.problems.length > 1 ? (
          <div className="border-divider flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-3 py-2">
            {race.problems.map((p, index) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProblemIndex(index)}
                className={`rounded-control shrink-0 px-3 py-1.5 text-xs font-medium ${
                  index === problemIndex
                    ? "bg-action text-white"
                    : "text-ink-muted hover:bg-panel"
                }`}
              >
                Problem {index + 1}
              </button>
            ))}
          </div>
        ) : null}

        {!problem ? (
          <div className="text-ink-muted flex flex-1 items-center justify-center p-8 text-sm">
            This Code Racing quiz doesn&apos;t have any problems yet.
          </div>
        ) : (
          <div className="grid flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[360px_1fr_260px] lg:overflow-hidden">
            <div className="border-structural bg-surface rounded-panel border p-3 lg:overflow-y-auto">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-ink-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Problem {problemIndex + 1}: {problem.title}
                </h3>
                <span className="text-ink-muted shrink-0 text-[11px]">
                  {problem.points} pts
                </span>
              </div>
              <FormattedInstructions
                text={problem.instructions}
                className="text-ink-secondary space-y-2 text-sm leading-6"
              />
              <p className="border-divider bg-panel text-ink-muted rounded-control mt-3 border p-2 text-[10px] leading-4">
                {comparisonHelp[problem.comparisonMode]}
                {problem.comparisonMode === "numeric"
                  ? ` Tolerance: ±${problem.numericTolerance}.`
                  : ""}
              </p>
              {visibleTestCases.length > 0 ? (
                <div className="mt-4">
                  <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                    Visible example{visibleTestCases.length > 1 ? "s" : ""}
                  </h3>
                  <ul className="space-y-2">
                    {visibleTestCases.map((testCase, index) => (
                      <li
                        key={testCase.id}
                        className="border-divider bg-panel rounded-control border p-2"
                      >
                        <p className="text-ink-muted text-[10px]">
                          Example {index + 1} — input
                        </p>
                        <pre className="text-ink-primary mt-1 font-mono text-[11px] whitespace-pre-wrap">
                          {testCase.stdin || "(no input)"}
                        </pre>
                        {testCase.showExpectedOutput ? (
                          <>
                            <p className="text-ink-muted mt-2 text-[10px]">
                              Expected output
                            </p>
                            <pre className="text-ink-primary mt-1 font-mono text-[11px] whitespace-pre-wrap">
                              {testCase.expectedStdout || "(no output)"}
                            </pre>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="border-structural bg-surface rounded-panel flex flex-col overflow-hidden border lg:h-full lg:min-h-0">
              <div className="border-divider flex shrink-0 items-center justify-between border-b px-3 py-2">
                <span className="text-ink-muted flex items-center gap-1.5 text-[11px]">
                  <FileCode2 aria-hidden="true" size={13} />
                  Main.{codeLanguageMeta[problem.language].extension}
                </span>
                <span className="text-ink-muted text-[11px]">
                  {codeLanguageMeta[problem.language].label} · read-only preview
                </span>
              </div>
              <div className="h-80 lg:h-auto lg:min-h-0 lg:flex-1">
                <CodeEditor
                  value={
                    problem.starterCode ??
                    codeLanguageMeta[problem.language].template
                  }
                  language={codeLanguageMeta[problem.language].monacoId}
                  onChange={() => undefined}
                  fontSize={14}
                />
              </div>
              <div className="border-divider text-ink-muted shrink-0 border-t p-2 text-center text-[11px]">
                Preview only — Run, Test Code, and Submit are disabled here.
              </div>
            </div>

            <div className="border-structural bg-surface rounded-panel border p-3 lg:overflow-y-auto">
              <h3 className="text-ink-primary flex items-center gap-2 text-sm font-semibold">
                <TestTube2 aria-hidden="true" size={15} />
                Tests
              </h3>
              <ul className="mt-2 space-y-1.5">
                {problem.testCases.map((testCase, index) => (
                  <li
                    key={testCase.id}
                    className="bg-panel text-ink-muted rounded-control border border-transparent px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="border-ink-disabled size-3 shrink-0 rounded-full border-2"
                      />
                      <span>
                        {testCase.isHidden ? "Hidden test" : "Visible test"}{" "}
                        {index + 1}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-divider text-ink-muted mt-3 flex items-center justify-between border-t pt-3 text-xs">
                <span>Score</span>
                <span className="text-ink-primary font-semibold">
                  —/{problem.testCases.length} cases
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
