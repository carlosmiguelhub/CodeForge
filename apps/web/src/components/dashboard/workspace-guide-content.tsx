import type { GuideSample } from "../workbench/guide-modal";
import {
  sqlGuideSamples,
  sqlGuideSections,
} from "../workbench/sql-guide-content";
import {
  codeGuideSamples,
  codeGuideSections,
} from "../code-workbench/code-guide-content";
import { erdGuideSections } from "../erd-workbench/erd-guide-content";
import type { GuideTourStep } from "./workspace-guide-modal";

function SampleList({
  samples,
}: Readonly<{ samples: readonly GuideSample[] }>) {
  return (
    <div className="space-y-3">
      {samples.map((sample) => (
        <div
          key={sample.label}
          className="border-divider bg-deep rounded-control overflow-hidden border"
        >
          <div className="border-divider bg-surface border-b px-3 py-2">
            <p className="text-ink-primary text-xs font-semibold">
              {sample.label}
            </p>
            <p className="text-ink-muted mt-0.5 text-[11px]">
              {sample.description}
            </p>
          </div>
          <pre className="text-ink-primary overflow-x-auto p-3 font-mono text-[11px] whitespace-pre-wrap">
            {sample.code}
          </pre>
        </div>
      ))}
    </div>
  );
}

// Every workspace's tour reuses the exact same section copy shown by its own
// in-editor Guide modal — one source of truth, so the two never drift.
export const sqlWorkspaceGuideSteps: readonly GuideTourStep[] = [
  ...sqlGuideSections.map((section) => ({
    title: section.title,
    body: <p>{section.body}</p>,
  })),
  {
    title: "Sample queries to try",
    body: <SampleList samples={sqlGuideSamples} />,
  },
];

export const codeWorkspaceGuideSteps: readonly GuideTourStep[] = [
  ...codeGuideSections.map((section) => ({
    title: section.title,
    body: <p>{section.body}</p>,
  })),
  {
    title: "Sample programs to try",
    body: (
      <div className="space-y-3">
        <p className="text-ink-muted text-xs leading-5">
          Shown here in Python — every language (Java, C++, JavaScript, C) gets
          its own starter samples once you&apos;re inside.
        </p>
        <SampleList samples={codeGuideSamples.python} />
      </div>
    ),
  },
];

// erdGuideSamples encode raw JSON diagram data (meant to be inserted
// straight onto the canvas), not human-readable text — not worth a tour
// step, so the ERD tour sticks to the four descriptive sections.
export const erdWorkspaceGuideSteps: readonly GuideTourStep[] =
  erdGuideSections.map((section) => ({
    title: section.title,
    body: <p>{section.body}</p>,
  }));
