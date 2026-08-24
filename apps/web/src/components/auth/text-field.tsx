"use client";

import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";
import { type InputHTMLAttributes, useId, useState } from "react";

export function TextField({
  label,
  icon: Icon,
  type = "text",
  className,
  ...props
}: Readonly<
  {
    label: string;
    icon: LucideIcon;
  } & InputHTMLAttributes<HTMLInputElement>
>) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword && revealed ? "text" : type;

  return (
    <label htmlFor={id} className="block">
      <span className="text-ink-secondary mb-1.5 block text-xs font-medium">
        {label}
      </span>
      <div className="relative">
        <Icon
          aria-hidden="true"
          size={16}
          className="text-ink-disabled pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          id={id}
          type={resolvedType}
          className={`rounded-control border-structural bg-elevated text-ink-primary placeholder:text-ink-disabled focus:border-action h-10 w-full border py-2 pl-9 transition-colors ${isPassword ? "pr-9" : "pr-3"} ${className ?? ""}`}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            className="text-ink-disabled hover:text-ink-secondary absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
            aria-label={revealed ? "Hide password" : "Show password"}
          >
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        ) : null}
      </div>
    </label>
  );
}
