"use client";

import type * as Monaco from "monaco-editor";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { defineEditorThemes, themeNameFor } from "@/lib/monaco-editor-theme";
import { useTheme } from "@/components/theme/theme-provider";

export interface SqlEditorController {
  getSelectedSql(): string;
  getCurrentSql(): string;
  focus(): void;
}

export const SqlEditor = forwardRef<
  SqlEditorController,
  {
    value: string;
    onChange(value: string): void;
    fontSize: number;
    onRunShortcut?: () => void;
  }
>(function SqlEditor(
  { value, onChange, fontSize, onRunShortcut },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const runShortcutRef = useRef(onRunShortcut);
  runShortcutRef.current = onRunShortcut;
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useImperativeHandle(forwardedRef, () => ({
    getSelectedSql() {
      const editor = editorRef.current;
      const selection = editor?.getSelection();
      return editor && selection
        ? (editor.getModel()?.getValueInRange(selection) ?? "")
        : "";
    },
    getCurrentSql() {
      const editor = editorRef.current;
      const model = editor?.getModel();
      const position = editor?.getPosition();
      if (!model || !position) return "";
      const source = model.getValue();
      const offset = model.getOffsetAt(position);
      const start = source.lastIndexOf(";", Math.max(0, offset - 1)) + 1;
      const next = source.indexOf(";", offset);
      return source.slice(start, next === -1 ? source.length : next + 1).trim();
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
    // Desktop wraps long lines — plenty of width, and horizontal scroll is
    // an unnecessary extra step with a mouse. Mobile keeps the horizontal
    // scrollbar/overflow instead, since it's built for a finger drag.
    const narrowQuery = window.matchMedia("(max-width: 1023px)");
    const applyWordWrap = () =>
      editor?.updateOptions({ wordWrap: narrowQuery.matches ? "off" : "on" });
    void import("monaco-editor").then((monaco) => {
      if (disposed || !hostRef.current) return;
      monacoRef.current = monaco;
      defineEditorThemes(monaco, {
        keyword: "keyword.sql",
        string: "string.sql",
        number: "number.sql",
        comment: "comment.sql",
      });
      editor = monaco.editor.create(hostRef.current, {
        value: valueRef.current,
        language: "sql",
        theme: themeNameFor(themeRef.current),
        automaticLayout: true,
        wordWrap: narrowQuery.matches ? "off" : "on",
        // A thicker, always-visible horizontal scrollbar so long lines
        // stay easy to drag-scroll with a finger on touch screens instead
        // of relying on a swipe gesture over the text itself.
        scrollbar: {
          horizontal: "visible",
          horizontalScrollbarSize: 14,
          verticalScrollbarSize: 14,
        },
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: "var(--font-mono)",
        fontSize,
        lineHeight: 20,
        renderWhitespace: "selection",
        padding: { top: 12, bottom: 12 },
        tabSize: 2,
        accessibilitySupport: "auto",
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        if (editor) changeRef.current(editor.getValue());
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        runShortcutRef.current?.();
      });
    });
    narrowQuery.addEventListener("change", applyWordWrap);
    return () => {
      disposed = true;
      narrowQuery.removeEventListener("change", applyWordWrap);
      editorRef.current = null;
      editor?.dispose();
    };
  }, [fontSize]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(themeNameFor(theme));
  }, [theme]);

  return (
    <div
      ref={hostRef}
      aria-label="SQL editor"
      className="h-full min-h-64 w-full overflow-hidden"
    />
  );
});
