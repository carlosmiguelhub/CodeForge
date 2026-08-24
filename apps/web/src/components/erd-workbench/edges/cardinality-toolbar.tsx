"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Cardinality } from "../types";
import {
  glyphFor,
  notationGroups,
  notationOptions,
} from "./cardinality-markers";

// A short stub line behind the glyph, with the endpoint sitting right on
// the outer edge of the box — the same pattern Lucidchart's endpoint picker
// uses, so each option previews how the notation actually looks attached
// to a line instead of showing the symbol floating alone.
function NotationIcon({
  cardinality,
  facing,
  width = 40,
}: Readonly<{
  cardinality: Cardinality;
  facing: "left" | "right";
  width?: number;
}>) {
  return (
    <svg
      viewBox="0 0 40 12"
      width={width}
      height={Math.round((width * 12) / 40)}
      aria-hidden="true"
      className="shrink-0"
    >
      <g stroke="currentColor" strokeWidth={1.75} fill="none">
        {facing === "left" ? (
          <line x1="24" y1="6" x2="40" y2="6" />
        ) : (
          <line x1="0" y1="6" x2="16" y2="6" />
        )}
        <g
          transform={
            facing === "left" ? "translate(0,6)" : "translate(40,6) scale(-1,1)"
          }
        >
          {glyphFor(cardinality)}
        </g>
      </g>
    </svg>
  );
}

function NotationSelect({
  label,
  facing,
  value,
  onChange,
}: Readonly<{
  label: string;
  facing: "left" | "right";
  value: Cardinality;
  onChange: (value: Cardinality) => void;
}>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active =
    notationOptions.find((option) => option.value === value) ??
    notationOptions[0]!;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <p className="text-ink-muted mb-1 text-[9px] font-semibold uppercase">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active.label}
        className="rounded-control border-structural bg-elevated text-ink-primary hover:bg-elevated-high flex min-h-9 items-center gap-1 border px-2"
      >
        <NotationIcon cardinality={value} facing={facing} />
        <ChevronDown aria-hidden="true" size={12} className="text-ink-muted" />
        <span className="sr-only">{active.label}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={`${label} notation`}
          className="border-structural bg-elevated rounded-control absolute left-0 z-20 mt-1 max-h-80 w-24 overflow-y-auto border p-1 shadow-xl"
        >
          {notationGroups.map((group) => (
            <div key={group.label}>
              <p className="text-ink-muted mt-1.5 mb-0.5 px-1 text-[8px] font-semibold uppercase first:mt-0">
                {group.label}
              </p>
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  title={option.label}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`${
                    option.value === value
                      ? "bg-elevated-high text-action"
                      : "text-ink-secondary hover:bg-elevated-high hover:text-ink-primary"
                  } rounded-control flex min-h-10 w-full items-center justify-center px-1`}
                >
                  <NotationIcon
                    cardinality={option.value}
                    facing={facing}
                    width={52}
                  />
                  <span className="sr-only">{option.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Lives in the workbench's fixed toolbar, not on the canvas — an
// edge-anchored popover always finds some entity to collide with sooner or
// later on an unbounded canvas, so this instead sits in a spot that never
// moves and never overlaps diagram content.
export function CardinalityToolbar({
  leftCardinality,
  rightCardinality,
  onChangeLeft,
  onChangeRight,
}: Readonly<{
  leftCardinality: Cardinality;
  rightCardinality: Cardinality;
  onChangeLeft: (value: Cardinality) => void;
  onChangeRight: (value: Cardinality) => void;
}>) {
  return (
    <div
      role="group"
      aria-label="Relationship notation"
      className="flex items-start gap-3"
    >
      <NotationSelect
        label="Left"
        facing="left"
        value={leftCardinality}
        onChange={onChangeLeft}
      />
      <NotationSelect
        label="Right"
        facing="right"
        value={rightCardinality}
        onChange={onChangeRight}
      />
    </div>
  );
}
