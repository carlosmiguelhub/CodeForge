import { z } from "zod";

export const webFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/\.(html|css|js)$/i, "File name must end in .html, .css, or .js");

export const webFolderNameSchema = z.string().trim().min(1).max(200);

export const webFileKindSchema = z.enum(["html", "css", "javascript"]);
export type WebFileKind = z.infer<typeof webFileKindSchema>;

export const webFileKindMeta: Readonly<
  Record<
    WebFileKind,
    {
      readonly monacoId: string;
      readonly extension: string;
      readonly label: string;
    }
  >
> = {
  html: { monacoId: "html", extension: "html", label: "HTML" },
  css: { monacoId: "css", extension: "css", label: "CSS" },
  javascript: {
    monacoId: "javascript",
    extension: "js",
    label: "JavaScript",
  },
};

// File type is deliberately derived from the name instead of persisted. A
// rename therefore cannot leave editor language metadata out of sync.
export function webFileKindFromName(name: string): WebFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".js")) return "javascript";
  return null;
}

const webFileNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("file"),
  name: webFileNameSchema,
  sourceCode: z.string().max(100_000),
});

interface WebFolderNodeInput {
  id: string;
  kind: "folder";
  name: string;
  children: (z.infer<typeof webFileNodeSchema> | WebFolderNodeInput)[];
}

const webFolderNodeSchema: z.ZodType<WebFolderNodeInput> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    kind: z.literal("folder"),
    name: webFolderNameSchema,
    children: z.array(webNodeSchema).max(500),
  }),
);

const webNodeSchema: z.ZodType<
  z.infer<typeof webFileNodeSchema> | WebFolderNodeInput
> = z.lazy(() => z.union([webFileNodeSchema, webFolderNodeSchema]));

export const webWorkspaceContentSchema = z.object({
  root: webFolderNodeSchema,
  expanded: z.array(z.string()).max(500),
  openFileIds: z.array(z.string()).max(100),
  activeFileId: z.string(),
});
export type WebWorkspaceContent = z.infer<typeof webWorkspaceContentSchema>;

export const webWorkspaceSchema = z.object({
  ownerId: z.string().uuid(),
  content: webWorkspaceContentSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type WebWorkspace = z.infer<typeof webWorkspaceSchema>;

export const webWorkspaceSaveRequestSchema = z.object({
  content: webWorkspaceContentSchema,
});
export type WebWorkspaceSaveRequest = z.infer<
  typeof webWorkspaceSaveRequestSchema
>;

type WebWorkspaceNode = z.infer<typeof webFileNodeSchema> | WebFolderNodeInput;

export function countWebWorkspaceFiles(node: WebWorkspaceNode): number {
  if (node.kind === "file") return 1;
  return node.children.reduce(
    (sum, child) => sum + countWebWorkspaceFiles(child),
    0,
  );
}
