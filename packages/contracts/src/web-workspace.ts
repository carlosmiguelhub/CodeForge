import { z } from "zod";

export const webFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/\.(html|css|js)$/i, "File name must end in .html, .css, or .js");

// Separate from webFileNameSchema on purpose: the "New file" draft flow
// (hand-typed name, starts with boilerplate/empty text content) should
// never accept an image extension and silently create an empty, broken
// "image" — only the upload flow (which supplies real image bytes from a
// picked file) should produce one. Renaming an existing image, however,
// does need to accept these extensions — see webAnyFileNameSchema below.
export const webImageFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /\.(png|jpe?g|gif|svg|webp)$/i,
    "Image name must end in .png, .jpg, .gif, .svg, or .webp",
  );

// Used for renaming a file whose *current* kind is already known — accepts
// whichever extension family that kind allows, text or image.
export const webAnyFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /\.(html|css|js|png|jpe?g|gif|svg|webp)$/i,
    "File name must end in .html, .css, .js, .png, .jpg, .gif, .svg, or .webp",
  );

export const webFolderNameSchema = z.string().trim().min(1).max(200);

// A 100,000-char cap on sourceCode (below) applies to every file kind,
// image data URLs included. Base64 inflates raw bytes by ~4/3, and the
// "data:image/...;base64," prefix costs a little more — capping the
// original upload at 70,000 bytes keeps the encoded result comfortably
// under that limit with room to spare.
export const WEB_IMAGE_MAX_BYTES = 70_000;

export const webFileKindSchema = z.enum(["html", "css", "javascript", "image"]);
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
  // monacoId is unused for images — they never open in the code editor,
  // only an <img> preview pane — but kept non-empty so this stays a valid
  // Monaco language id if some future caller passes it through anyway.
  image: { monacoId: "plaintext", extension: "png", label: "Image" },
};

// File type is deliberately derived from the name instead of persisted. A
// rename therefore cannot leave editor language metadata out of sync.
export function webFileKindFromName(name: string): WebFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".js")) return "javascript";
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(lower)) return "image";
  return null;
}

const webFileNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("file"),
  name: webAnyFileNameSchema,
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
