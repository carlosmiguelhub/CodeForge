"use client";

import { useEffect, useState } from "react";

import { useTheme } from "@/components/theme/theme-provider";
import { defineEditorThemes, themeNameFor } from "@/lib/monaco-editor-theme";

// Static, read-only syntax-highlighted code for Code Quiz questions/
// choices — uses Monaco's colorize() rather than a live CodeEditor
// instance, so it's cheap to render many of these on one page (a quiz can
// have up to 20 questions × 6 choices). Monaco's colorizer HTML-escapes
// the source text itself before wrapping tokens in styled spans, so the
// returned markup is safe to render despite using dangerouslySetInnerHTML
// — this never touches arbitrary/unescaped HTML, only code text. Falls
// back to a plain <pre> until highlighting resolves (or if it fails),
// so the content is never blocked on Monaco loading.
export function CodeSnippet({
  code,
  language,
  className,
}: Readonly<{ code: string; language: string; className?: string }>) {
  const { theme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("monaco-editor")
      .then(async (monaco) => {
        if (cancelled) return;
        defineEditorThemes(monaco, {
          keyword: "keyword",
          string: "string",
          number: "number",
          comment: "comment",
        });
        // colorize() has no per-call theme option — it colors using
        // whichever theme is currently active globally, same as any live
        // CodeEditor instance. Both always derive from the same app-wide
        // theme() value, so this never fights a live editor's own
        // setTheme call.
        monaco.editor.setTheme(themeNameFor(theme));
        const colored = await monaco.editor.colorize(code, language, {});
        if (!cancelled) setHtml(colored);
      })
      .catch(() => {
        // Leave html null — the plain-<pre> fallback below still shows
        // the code, just without coloring.
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  if (!html) {
    return (
      <pre className={className}>
        <code>{code}</code>
      </pre>
    );
  }
  return (
    // Safe despite dangerouslySetInnerHTML — see the file comment above:
    // Monaco's colorize() escapes the source text itself, this is only
    // highlighted code, never arbitrary HTML.
    <pre className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
