"use client";

import { Bold, List, Underline } from "lucide-react";
import { useRef } from "react";

// Pairs with FormattedInstructions' markup: **bold**, __underline__, "- "
// bullet lines. Toolbar buttons manipulate the raw textarea text directly
// (wrap the selection, or prefix/strip "- " on the selected lines) rather
// than using a contenteditable/WYSIWYG editor — keeps the stored value a
// plain string (same type as before this existed) and the render path a
// simple, XSS-free hand-built parser instead of raw HTML.
export function InstructionsEditor({
  value,
  onChange,
  rows = 7,
  required,
  maxLength,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
  maxLength?: number;
}>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function wrapSelection(marker: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const next =
      value.slice(0, start) + marker + selected + marker + value.slice(end);
    onChange(next);
    const selectionStart = start + marker.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectionStart,
        selectionStart + selected.length,
      );
    });
  }

  function toggleBullets() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNewline = value.indexOf("\n", end > start ? end - 1 : end);
    const lineEnd = nextNewline === -1 ? value.length : nextNewline;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const bulleted = lines.filter((line) => line.trim() !== "");
    const allBulleted =
      bulleted.length > 0 && bulleted.every((line) => /^[-*]\s/.test(line));
    const nextLines = lines.map((line) => {
      if (line.trim() === "") return line;
      return allBulleted ? line.replace(/^[-*]\s+/, "") : `- ${line}`;
    });
    const nextBlock = nextLines.join("\n");
    const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + nextBlock.length);
    });
  }

  return (
    <div>
      <div className="border-structural bg-panel rounded-t-control mt-1 flex items-center gap-1 border border-b-0 px-1.5 py-1">
        <button
          type="button"
          onClick={() => wrapSelection("**")}
          title="Bold (**text**)"
          className="text-ink-secondary hover:bg-elevated hover:text-ink-primary rounded-control grid size-6 place-items-center"
        >
          <Bold aria-hidden="true" size={13} />
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("__")}
          title="Underline (__text__)"
          className="text-ink-secondary hover:bg-elevated hover:text-ink-primary rounded-control grid size-6 place-items-center"
        >
          <Underline aria-hidden="true" size={13} />
        </button>
        <button
          type="button"
          onClick={toggleBullets}
          title="Bullet list"
          className="text-ink-secondary hover:bg-elevated hover:text-ink-primary rounded-control grid size-6 place-items-center"
        >
          <List aria-hidden="true" size={13} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        required={required}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-structural bg-canvas text-ink-primary rounded-b-control w-full border px-2.5 py-1.5 text-sm"
      />
    </div>
  );
}
