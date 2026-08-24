"use client";

import { PlusSquare, X } from "lucide-react";
import type { ReactNode } from "react";

export interface GuideSample {
  readonly label: string;
  readonly description: string;
  readonly code: string;
}

export interface GuideSectionData {
  readonly title: string;
  readonly body: ReactNode;
}

export function GuideModal({
  title,
  description,
  sections,
  samples,
  samplesTitle,
  onInsertSample,
  onClose,
}: Readonly<{
  title: string;
  description: string;
  sections: readonly GuideSectionData[];
  samples: readonly GuideSample[];
  samplesTitle: string;
  onInsertSample: (code: string) => void;
  onClose: () => void;
}>) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel flex max-h-[85vh] w-full min-w-0 max-w-2xl flex-col border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2
              id="guide-title"
              className="font-heading text-ink-primary text-lg font-semibold"
            >
              {title}
            </h2>
            <p className="text-ink-muted mt-1 text-sm leading-5">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="text-ink-muted hover:bg-elevated-high hover:text-ink-primary rounded-control grid size-8 shrink-0 place-items-center"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-ink-primary mb-1.5 text-sm font-semibold">
                {section.title}
              </h3>
              <div className="text-ink-secondary text-xs leading-5">
                {section.body}
              </div>
            </div>
          ))}

          <div>
            <h3 className="text-ink-primary mb-2 text-sm font-semibold">
              {samplesTitle}
            </h3>
            <div className="space-y-2">
              {samples.map((sample) => (
                <div
                  key={sample.label}
                  className="border-divider bg-deep rounded-control overflow-hidden border"
                >
                  <div className="border-divider bg-surface flex items-center justify-between gap-3 border-b px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-ink-primary text-xs font-semibold">
                        {sample.label}
                      </p>
                      <p className="text-ink-muted mt-0.5 truncate text-[11px]">
                        {sample.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onInsertSample(sample.code)}
                      className="text-action-soft hover:bg-elevated-high rounded-control flex min-h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium"
                    >
                      <PlusSquare aria-hidden="true" size={13} />
                      Open in new tab
                    </button>
                  </div>
                  <pre className="text-ink-primary overflow-x-auto p-3 font-mono text-[11px] whitespace-pre-wrap">
                    {sample.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
