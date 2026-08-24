import { z } from "zod";

import { codeLanguageSchema } from "./code-execution";

const codeFileNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("file"),
  name: z.string().min(1).max(200),
  language: codeLanguageSchema,
  sourceCode: z.string().max(100_000),
});

interface CodeFolderNodeInput {
  id: string;
  kind: "folder";
  name: string;
  children: (z.infer<typeof codeFileNodeSchema> | CodeFolderNodeInput)[];
}

const codeFolderNodeSchema: z.ZodType<CodeFolderNodeInput> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    kind: z.literal("folder"),
    name: z.string().min(1).max(200),
    children: z.array(codeNodeSchema).max(500),
  }),
);

const codeNodeSchema: z.ZodType<
  z.infer<typeof codeFileNodeSchema> | CodeFolderNodeInput
> = z.lazy(() => z.union([codeFileNodeSchema, codeFolderNodeSchema]));

export const codeWorkspaceContentSchema = z.object({
  root: codeFolderNodeSchema,
  expanded: z.array(z.string()).max(500),
  openFileIds: z.array(z.string()).max(100),
  activeFileId: z.string(),
});
export type CodeWorkspaceContent = z.infer<typeof codeWorkspaceContentSchema>;

export const codeWorkspaceSchema = z.object({
  ownerId: z.string().uuid(),
  content: codeWorkspaceContentSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CodeWorkspace = z.infer<typeof codeWorkspaceSchema>;

export const codeWorkspaceSaveRequestSchema = z.object({
  content: codeWorkspaceContentSchema,
});
export type CodeWorkspaceSaveRequest = z.infer<
  typeof codeWorkspaceSaveRequestSchema
>;

type CodeWorkspaceNode =
  | z.infer<typeof codeFileNodeSchema>
  | CodeFolderNodeInput;

export function countCodeWorkspaceFiles(node: CodeWorkspaceNode): number {
  if (node.kind === "file") return 1;
  return node.children.reduce(
    (sum, child) => sum + countCodeWorkspaceFiles(child),
    0,
  );
}
