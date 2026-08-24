import type * as Monaco from "monaco-editor";

export const DARK_THEME_NAME = "sqweb-dark";
export const LIGHT_THEME_NAME = "sqweb-light";

export function themeNameFor(theme: "dark" | "light"): string {
  return theme === "light" ? LIGHT_THEME_NAME : DARK_THEME_NAME;
}

function rules(
  keywordToken: string,
  stringToken: string,
  numberToken: string,
  commentToken: string,
  colors: { keyword: string; string: string; number: string; comment: string },
): Monaco.editor.ITokenThemeRule[] {
  return [
    { token: keywordToken, foreground: colors.keyword },
    { token: stringToken, foreground: colors.string },
    { token: numberToken, foreground: colors.number },
    { token: commentToken, foreground: colors.comment },
  ];
}

/**
 * Monaco's defineTheme needs literal hex, not CSS custom properties, so
 * these mirror the design tokens in packages/design-system/src/tokens.css
 * by hand rather than reading them at runtime.
 */
export function defineEditorThemes(
  monaco: typeof Monaco,
  tokenPrefixes: { keyword: string; string: string; number: string; comment: string },
) {
  monaco.editor.defineTheme(DARK_THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: rules(
      tokenPrefixes.keyword,
      tokenPrefixes.string,
      tokenPrefixes.number,
      tokenPrefixes.comment,
      { keyword: "BEC2FF", string: "E5FD17", number: "50D8E9", comment: "73767C" },
    ),
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

  monaco.editor.defineTheme(LIGHT_THEME_NAME, {
    base: "vs",
    inherit: true,
    rules: rules(
      tokenPrefixes.keyword,
      tokenPrefixes.string,
      tokenPrefixes.number,
      tokenPrefixes.comment,
      { keyword: "444FD6", string: "4D7C0F", number: "0E8FA1", comment: "888B94" },
    ),
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#2A2C33",
      "editorLineNumber.foreground": "#B5B8C0",
      "editorLineNumber.activeForeground": "#797C86",
      "editor.selectionBackground": "#5E6BFF33",
      "editorCursor.foreground": "#444FD6",
      "editorIndentGuide.background1": "#E3E5E9",
    },
  });
}
