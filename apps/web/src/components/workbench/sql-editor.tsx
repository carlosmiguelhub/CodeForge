"use client";

import type * as Monaco from "monaco-editor";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

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
  }
>(function SqlEditor({ value, onChange, fontSize }, forwardedRef) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

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
    void import("monaco-editor").then((monaco) => {
      if (disposed || !hostRef.current) return;
      monaco.editor.defineTheme("sqweb-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "keyword.sql", foreground: "BEC2FF" },
          { token: "string.sql", foreground: "E5FD17" },
          { token: "number.sql", foreground: "50D8E9" },
          { token: "comment.sql", foreground: "73767C" },
        ],
        colors: {
          "editor.background": "#080809",
          "editor.foreground": "#E5E2E3",
          "editorLineNumber.foreground": "#454655",
          "editorLineNumber.activeForeground": "#9A9DA3",
          "editor.selectionBackground": "#5E6BFF55",
          "editorCursor.foreground": "#BEC2FF",
          "editorIndentGuide.background1": "#1B1C1E",
        },
      });
      editor = monaco.editor.create(hostRef.current, {
        value: valueRef.current,
        language: "sql",
        theme: "sqweb-dark",
        automaticLayout: true,
        wordWrap: "off",
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
    });
    return () => {
      disposed = true;
      editorRef.current = null;
      editor?.dispose();
    };
  }, [fontSize]);

  return (
    <div
      ref={hostRef}
      aria-label="SQL editor"
      className="h-full min-h-64 w-full overflow-hidden"
    />
  );
});
