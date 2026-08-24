import { Loader2 } from "lucide-react";

// Single source for the app's busy/loading indicator — every button that
// swaps its icon for this (or prepends it) while an action is in flight
// should render the same spin speed, size default, and reduced-motion
// fallback rather than reimplementing it inline.
export function Spinner({
  size = 14,
  className = "",
}: Readonly<{ size?: number; className?: string }>) {
  return (
    <Loader2
      aria-hidden="true"
      size={size}
      className={`animate-spin motion-reduce:animate-none ${className}`.trim()}
    />
  );
}
