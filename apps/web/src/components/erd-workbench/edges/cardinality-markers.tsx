import type { Cardinality } from "../types";

// Authored with the local origin touching the entity, extending toward +x
// — used by both the notation picker's preview icons (cardinality-toolbar)
// and the actual edge (crows-foot-edge), each applying their own
// translate/rotate/flip to place it correctly. Single source of truth so
// the preview can never drift from what the diagram actually draws.
//
// Crow's-foot marks: the cardinality mark (bar = one, fork = many) touches
// the entity directly — same as real crow's-foot notation, where the foot
// itself lands on the box — with the participation mark (bar = mandatory,
// circle = optional) sitting further out on the line. A fork's own point
// (not its opening) still extends furthest from the entity of the two.
//
// Arrows/shapes: the tip (arrow apex, or the near edge of a diamond/
// square/circle) touches the entity at local x=0, same as an arrowhead
// touching the box it points at, and extends outward into the line.
// Filled variants set their own fill="currentColor" — the parent <g> in
// both call sites forces fill:none so open shapes stay hollow by default.
export function glyphFor(cardinality: Cardinality) {
  switch (cardinality) {
    case "none":
      return null;
    case "arrow-open":
      return <path d="M12,-5 L0,0 L12,5" fill="none" />;
    case "arrow-filled":
      return <path d="M0,0 L12,-4 L12,4 Z" fill="currentColor" />;
    case "arrow-block-open":
      return <path d="M0,0 L16,-6 L16,6 Z" fill="none" />;
    case "arrow-block-filled":
      return <path d="M0,0 L16,-6 L16,6 Z" fill="currentColor" />;
    case "diamond-open":
      return <path d="M0,0 L8,-5 L16,0 L8,5 Z" fill="none" />;
    case "diamond-filled":
      return <path d="M0,0 L8,-5 L16,0 L8,5 Z" fill="currentColor" />;
    case "square-open":
      return <rect x="0" y="-5" width="10" height="10" fill="none" />;
    case "square-filled":
      return <rect x="0" y="-5" width="10" height="10" fill="currentColor" />;
    case "circle-open":
      return <circle cx="6" cy="0" r="6" fill="none" />;
    case "circle-filled":
      return <circle cx="6" cy="0" r="6" fill="currentColor" />;
    case "one-bar":
      return <line x1="10" y1="-5" x2="10" y2="5" />;
    case "one":
      return (
        <>
          <line x1="5" y1="-5" x2="5" y2="5" />
          <line x1="12" y1="-5" x2="12" y2="5" />
        </>
      );
    case "many":
      return (
        <>
          <path d="M13,0 L5,-5 M13,0 L5,5" fill="none" />
          <line x1="20" y1="-5" x2="20" y2="5" />
        </>
      );
    case "zero-or-one":
      return (
        <>
          <line x1="5" y1="-5" x2="5" y2="5" />
          <circle cx="16" cy="0" r="3.5" />
        </>
      );
    case "zero-or-many":
      return (
        <>
          <path d="M13,0 L5,-5 M13,0 L5,5" fill="none" />
          <circle cx="20" cy="0" r="3.5" />
        </>
      );
  }
}

export interface NotationOption {
  readonly value: Cardinality;
  readonly label: string;
}

export interface NotationGroup {
  readonly label: string;
  readonly options: readonly NotationOption[];
}

// Grouped for the picker's dropdown list (section headers), and flattened
// by consumers that just need "all options" or "the label for a value."
export const notationGroups: readonly NotationGroup[] = [
  {
    label: "Line",
    options: [{ value: "none", label: "None" }],
  },
  {
    label: "Arrows",
    options: [
      { value: "arrow-open", label: "Open arrow" },
      { value: "arrow-filled", label: "Filled arrow" },
      { value: "arrow-block-open", label: "Open block arrow" },
      { value: "arrow-block-filled", label: "Filled block arrow" },
    ],
  },
  {
    label: "Shapes",
    options: [
      { value: "diamond-open", label: "Open diamond" },
      { value: "diamond-filled", label: "Filled diamond" },
      { value: "square-open", label: "Open square" },
      { value: "square-filled", label: "Filled square" },
      { value: "circle-open", label: "Open circle" },
      { value: "circle-filled", label: "Filled circle" },
    ],
  },
  {
    label: "Crow's Foot (ERD)",
    options: [
      { value: "one-bar", label: "One" },
      { value: "one", label: "One and only one" },
      { value: "many", label: "One or many" },
      { value: "zero-or-one", label: "Zero or one" },
      { value: "zero-or-many", label: "Zero or many" },
    ],
  },
];

export const notationOptions: readonly NotationOption[] =
  notationGroups.flatMap((group) => group.options);
