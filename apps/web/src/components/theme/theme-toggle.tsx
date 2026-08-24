"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "./theme-provider";

export function ThemeToggle({
  className = "",
}: Readonly<{ className?: string }>) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`rounded-control border-structural bg-surface text-ink-muted hover:text-ink-primary grid size-9 shrink-0 place-items-center border ${className}`}
    >
      {isDark ? (
        <Sun aria-hidden="true" size={17} />
      ) : (
        <Moon aria-hidden="true" size={17} />
      )}
    </button>
  );
}
