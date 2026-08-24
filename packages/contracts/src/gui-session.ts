import { z } from "zod";

// Flat filenames only in V1 — no folders, no Java `package` declarations
// (enforced separately at session-create time on the source text itself).
const javaFileNameSchema = z
  .string()
  .regex(
    /^[A-Z][A-Za-z0-9_]*\.java$/,
    "Use a valid Java class file name, e.g. Main.java.",
  );

export const javaGuiFileSchema = z.object({
  id: z.string().uuid(),
  name: javaFileNameSchema,
  sourceCode: z.string().max(50_000),
});
export type JavaGuiFile = z.infer<typeof javaGuiFileSchema>;

export const javaGuiWorkspaceContentSchema = z.object({
  files: z.array(javaGuiFileSchema).max(20),
  openFileIds: z.array(z.string().uuid()).max(20),
  activeFileId: z.string().uuid().nullable(),
  // The file whose class is launched with `java -cp ... <MainClass>` — its
  // name (minus ".java") must be a valid Java identifier, enforced by
  // javaFileNameSchema above; must reference an id present in `files`.
  mainFileId: z.string().uuid().nullable(),
});
export type JavaGuiWorkspaceContent = z.infer<
  typeof javaGuiWorkspaceContentSchema
>;

export const javaGuiWorkspaceSchema = z.object({
  ownerId: z.string().uuid(),
  content: javaGuiWorkspaceContentSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type JavaGuiWorkspace = z.infer<typeof javaGuiWorkspaceSchema>;

export const javaGuiWorkspaceSaveRequestSchema = z.object({
  content: javaGuiWorkspaceContentSchema,
});
export type JavaGuiWorkspaceSaveRequest = z.infer<
  typeof javaGuiWorkspaceSaveRequestSchema
>;

export const guiSessionStateSchema = z.enum([
  "requested",
  "provisioning",
  "running",
  "stopped",
  "failed",
  "expired",
]);
export type GuiSessionState = z.infer<typeof guiSessionStateSchema>;

export const guiSessionCreateRequestSchema = z.object({
  content: javaGuiWorkspaceContentSchema,
});
export type GuiSessionCreateRequest = z.infer<
  typeof guiSessionCreateRequestSchema
>;

export const guiSessionSchema = z.object({
  id: z.string().uuid(),
  state: guiSessionStateSchema,
  mainClassName: z.string(),
  maxRuntimeSeconds: z.number().int().positive(),
  failureCode: z.string().nullable(),
  // Present only in the create-response — a short-lived grant authorizing
  // this one session's console/vnc WebSocket connections (sent as a
  // `?token=` query param, since native WebSocket can't set headers). The
  // frontend builds the console/vnc URLs itself from its own
  // NEXT_PUBLIC_GUI_EXECUTION_API_URL, the same way executionFetch already
  // builds SQL/code execution URLs — never returned again by a later GET
  // (re-minting would require re-validating the workspace lock, which only
  // the create path does).
  grant: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type GuiSession = z.infer<typeof guiSessionSchema>;
