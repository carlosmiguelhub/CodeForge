"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

export interface GuideTourStep {
  readonly title: string;
  readonly body: ReactNode;
}

export function WorkspaceGuideModal({
  icon: Icon,
  title,
  description,
  steps,
  ctaLabel,
  ctaHref,
  onClose,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  description: string;
  steps: readonly GuideTourStep[];
  ctaLabel: string;
  ctaHref: string;
  onClose: () => void;
}>) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-guide-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel flex max-h-[85vh] w-full max-w-4xl min-w-0 flex-col border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-start justify-between gap-4 border-b px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-control border-divider bg-surface text-action-soft grid size-10 shrink-0 place-items-center border">
              <Icon aria-hidden="true" size={20} strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <h2
                id="workspace-guide-title"
                className="font-heading text-ink-primary text-lg font-semibold"
              >
                {title}
              </h2>
              <p className="text-ink-muted mt-0.5 text-sm leading-5">
                {description}
              </p>
            </div>
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

        <div className="min-h-[320px] flex-1 overflow-y-auto px-6 py-6">
          <p className="text-action-soft mb-2 text-xs font-semibold tracking-[0.1em] uppercase">
            Step {stepIndex + 1} of {steps.length}
          </p>
          <h3 className="text-ink-primary mb-3 text-xl font-semibold tracking-[-0.01em]">
            {step?.title}
          </h3>
          <div className="text-ink-secondary max-w-2xl text-sm leading-6">
            {step?.body}
          </div>
        </div>

        <div className="border-divider flex items-center justify-between gap-4 border-t px-6 py-4">
          <div className="flex items-center gap-1.5">
            {steps.map((s, index) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Go to step ${index + 1}: ${s.title}`}
                aria-current={index === stepIndex}
                onClick={() => setStepIndex(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === stepIndex
                    ? "bg-action w-6"
                    : "bg-divider hover:bg-ink-disabled w-1.5"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst ? (
              <button
                type="button"
                onClick={() => setStepIndex((current) => current - 1)}
                className="border-structural text-ink-secondary hover:bg-surface rounded-control flex min-h-9 items-center gap-1.5 border px-3 text-xs"
              >
                <ChevronLeft aria-hidden="true" size={14} /> Back
              </button>
            ) : null}
            {isLast ? (
              <Link
                href={ctaHref}
                onClick={onClose}
                className="bg-action hover:bg-action/90 rounded-control flex min-h-9 items-center gap-1.5 px-4 text-xs font-semibold text-white"
              >
                {ctaLabel} <ChevronRight aria-hidden="true" size={14} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex((current) => current + 1)}
                className="bg-action hover:bg-action/90 rounded-control flex min-h-9 items-center gap-1.5 px-4 text-xs font-semibold text-white"
              >
                Next <ChevronRight aria-hidden="true" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
