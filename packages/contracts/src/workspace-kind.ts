import { z } from "zod";

export const workspaceKindSchema = z.enum([
  "sql-workbench",
  "code-compiler",
  "erd-editor",
  "saved-queries",
  "java-gui-workspace",
]);
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;

export const workspaceKindLabels: Record<WorkspaceKind, string> = {
  "sql-workbench": "SQL Workbench",
  "code-compiler": "Code Compiler",
  "erd-editor": "ERD Editor",
  "saved-queries": "Saved Queries",
  "java-gui-workspace": "Java GUI Workspace",
};
