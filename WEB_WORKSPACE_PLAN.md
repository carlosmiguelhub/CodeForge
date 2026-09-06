# Web Workspace — Implementation Plan (for Codex)

## Context

CodeForge (internal name SQWeb) is a personal SQL/code/ERD practice suite. Students currently have a "Code Workspace" (Python/Java/C/C++/JS — single-file compile-and-run via Judge0/`interactive-run-api`) but nothing for front-end web development. This plan adds a new **Web Workspace**: students build an actual multi-file website — separate `.html`/`.css`/`.js` files organized in folders, exactly like the existing Code Workspace's file tree — with a **live preview that really links them together the way a browser does** (a `<link href="style.css">` in the HTML genuinely pulls in that sibling file's real content; this is not a fake single-file mockup).

This is going to production on the live site (code-forge.online, an InterServer VPS + Vercel deployment). It must work correctly — including on real mobile devices — before shipping, verified with the same rigor as every other change in this codebase: typecheck, test, and build clean at each stage, then deploy.

### Three scope decisions already confirmed with the product owner — do not re-litigate these

1. **Name**: "Web Workspace" (matches the existing naming style: "Code Workspace", "SQL Workbench").
2. **File linking model**: free-form, real linking by matching sibling file **names** across the whole tree — not a fixed 3-file toy. A student can name files however they like (`index.html`, `about.html`, `style.css`, `app.js`, more files in subfolders for organization) and `<link>`/`<script src>` references resolve by matching the referenced filename against any file with that name anywhere in the tree (flat-by-filename matching — see the "v1 scope limits" note below for why this isn't full relative-path resolution).
3. **Admin/leaderboard tracking**: presence-based, exactly like the existing ERD diagram count — **not** execution-based. There is no compile/pass-fail concept for a live HTML preview (nothing to "judge"), so this workspace's count folds into `contributionScore` on the Top Contributors leaderboard but must **never** contribute to `successfulWorkCount` — forcing a fake success signal there would just be lying with numbers.

### Key architecture principle: do NOT reuse Code Workspace's `CodeLanguage`/execution model

Code Workspace's file schema ties each file to `language: CodeLanguage` (`python`/`java`/`cpp`/`javascript`/`c`), each with a `judge0Id`, because those files get **executed server-side** (via Judge0 or the Docker-sandboxed `interactive-run-api`). A Web Workspace `.js` file is a completely different thing — it is **never executed server-side**, only rendered client-side inside a sandboxed `<iframe>` in the student's own browser tab. Conflating these two would be a real architecture mistake. Web Workspace needs its own, separate content schema.

### v1 scope limits (deliberate, not oversights)

- File linking resolves by **matching filename only**, not full nested relative-path resolution. `<link href="css/style.css">` resolves by matching the basename `style.css` against any file named that anywhere in the tree — it does not walk an actual `css/` subfolder the way a real static file server would. If two files share the same name in different folders, first-encountered-in-tree-order wins. This is a known, documented limitation — full path-based resolution is a reasonable future enhancement, not required for v1.
- Only `.html`, `.css`, `.js` files are allowed (enforced by filename validation at the schema level). No binary asset uploads (images, fonts) in v1 — an `<img src="logo.png">` will simply not resolve, same as any other reference to a file that doesn't exist in the tree.
- No PDF export, no "Run" button, no console/stdin-stdout — none of that applies to a live-rendering preview. The existing Code Workspace PDF export (`apps/web/src/components/code-workbench/code-pdf-export.ts`) is tightly coupled to the interactive-run console transcript model and should not be reused here.

---

## Confirmed facts about the existing codebase (verified directly against the real files — treat as ground truth)

### Code Workspace's file/folder tree model (the shape to mirror, not the language semantics)

`packages/contracts/src/code-workspace.ts`:

```ts
const codeFileNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("file"),
  name: z.string().min(1).max(200),
  language: codeLanguageSchema, // DO NOT reuse this for Web Workspace
  sourceCode: z.string().max(100_000),
});

// folder node (recursive via z.lazy — TS interface used for typing since
// zod can't self-infer a recursive type)
interface CodeFolderNodeInput {
  id: string;
  kind: "folder";
  name: string;
  children: (FileNode | CodeFolderNodeInput)[];
}

export const codeWorkspaceContentSchema = z.object({
  root: codeFolderNodeSchema, // whole tree nested under one root folder
  expanded: z.array(z.string()).max(500), // expanded folder ids — UI state, persisted
  openFileIds: z.array(z.string()).max(100),
  activeFileId: z.string(),
});
```

- Files vs. folders are distinguished by a `kind: "file" | "folder"` discriminant.
- **No `path` field** — location is purely structural (nesting via `children`); ids are opaque client-generated strings (`randomId()`).
- `countCodeWorkspaceFiles(node)` recursively counts file leaves — same file, reuse the pattern for a `countWebWorkspaceFiles`.

Backend (`packages/database-platform/src/schema.ts`, lines ~400-420):

```ts
export const codeWorkspaces = mysqlTable("code_workspaces", {
  id: char("id", { length: 36 }).primaryKey(),
  institutionId: char("institution_id", { length: 36 }).notNull().references(() => institutions.id, { onDelete: "restrict" }),
  ownerId: char("owner_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "restrict" }),
  content: json("content").notNull(),   // ENTIRE tree as one JSON column — one row per owner
  createdAt: timestamp(...).notNull().defaultNow(),
  updatedAt: timestamp(...).notNull().defaultNow().onUpdateNow(),
}, (table) => [uniqueIndex("code_workspaces_owner_uq").on(table.ownerId)]);
```

`MySqlCodeWorkspaceRepository` (`packages/database-platform/src/code-workspace-repository.ts`) has exactly three methods: `findByOwner`, `getOrCreate(institutionId, ownerId, blankContent)`, `save(institutionId, ownerId, content)` — always replaces the whole `content` column, no per-file queries. **Zero provisioning delay** — `getOrCreate` is a synchronous `INSERT ... ON DUPLICATE KEY UPDATE`, instant, no async provisioning worker (unlike SQL Workbench's real per-student MySQL database, or Java GUI Workspace's Docker container — both of which DO need an async provisioning worker; Web Workspace needs neither).

Service wrapper: `packages/code-workspace/src/code-workspace-service.ts`.

Platform-api routes (`apps/platform-api/src/server.ts`), `/v1/code-workspace`:

```ts
server.get("/v1/code-workspace", async (request) => {
  const verified = await dependencies.identity.verifyBearer(
    request.headers.authorization,
  );
  await dependencies.section.assertWorkspaceUnlocked(verified, "code-compiler");
  return dependencies.codeWorkspace.get(verified);
});
server.put("/v1/code-workspace", async (request) => {
  const verified = await dependencies.identity.verifyBearer(
    request.headers.authorization,
  );
  await dependencies.section.assertWorkspaceUnlocked(verified, "code-compiler");
  const body = codeWorkspaceSaveRequestSchema.parse(request.body);
  return dependencies.codeWorkspace.save(verified, body);
});
```

Frontend (`apps/web/src/components/code-workbench/code-workbench.tsx`, ~1241 lines, one large client component, no extracted lib). Six pure recursive tree-manipulation functions live inline at **lines 83-147** (confirmed by direct read):

```ts
function findNode(node: CodeNode, id: string): CodeNode | null { ... }
function findParentId(node: CodeFolderNode, id: string): string | null { ... }
function mapNode(node: CodeNode, id: string, fn: (node: CodeNode) => CodeNode): CodeNode { ... }
function insertChild(node: CodeNode, parentId: string, child: CodeNode): CodeNode { ... }
function removeNode(node: CodeNode, id: string): CodeNode { ... }
function collectFileIds(node: CodeNode): string[] { ... }
```

(Full bodies are in the actual file — copy them verbatim when extracting, see §4a below.)

UI/UX facts:

- Tree rendering: `renderNode(node, depth)` — expand/collapse via a `Set<string>` of expanded folder ids, inline create/rename via a `Draft` form state, delete closes affected open tabs (`collectFileIds` computes which tabs to close).
- **No drag-and-drop** exists anywhere in this file (confirmed via grep — no `onDragStart`/`onDrop`).
- Sidebar is duplicated for desktop (a permanent `<aside>`) and mobile (a slide-over triggered by `mobileFilesOpen` state) — **this exact pattern must be mirrored for Web Workspace's mobile layout.**
- Autosave: a 300ms-debounced `useEffect` that PUTs `{content: {root, expanded: [...expanded], openFileIds, activeFileId}}` whenever those states change.
- Monaco wiring: `<CodeEditor key={activeFile.id} value={activeFile.sourceCode} language={codeLanguageMeta[activeFile.language].monacoId} onChange={updateActiveSource} onRunShortcut={...} />` — remounts per active file via `key`.
- Resizable panels: `sidebarWidth`/`beginHorizontalResize`/`resizeSidebarByKeyboard` and `bottomHeight`/`beginVerticalResize`/`resizePanelByKeyboard` — pointer-drag AND keyboard-arrow-key support on a `role="separator"` element. Web Workspace needs the same behavior for two boundaries (tree↔editor, editor↔preview) instead of one.
- `apps/web/src/components/code-workbench/code-editor.tsx`: thin Monaco wrapper, takes a raw `language: string` prop, **no per-language special-casing** — directly reusable as-is. `monaco-editor` is the full package (confirmed `node_modules/monaco-editor/esm/vs/basic-languages/` includes `css`, `html`, `javascript`; `esm/vs/language/` includes `css`, `html`, `json`, `typescript` — rich language services already bundled, **zero new dependency needed**).

### Workspace-kind plumbing — full blast radius of adding a new kind

`packages/contracts/src/workspace-kind.ts` (current full contents, confirmed by direct read):

```ts
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
```

Add `"web-workspace"` to the enum and `"web-workspace": "Web Workspace"` to the labels. **`workspaceKindLabels` is typed `Record<WorkspaceKind, string>`, so TypeScript will refuse to compile until the label is added — this is an intentional safety net, not a bug to work around.**

**Automatic once the enum value + label exist (zero extra code needed):**

- `apps/web/src/components/admin/section-workspace-lock-dialog.tsx` — iterates `workspaceKindSchema.options` generically, renders a lock toggle row per kind.
- `apps/web/src/components/workspace/workspace-lock-gate.tsx` — generic component taking a `workspace: WorkspaceKind` prop; the new page just wraps itself in `<WorkspaceLockGate workspace="web-workspace">`.
- `packages/contracts/src/section.ts` / `packages/database-platform/src/section-repository.ts` — `lockedWorkspaces` plumbing is fully generic.

**NOT automatic — needs new hand-written code per kind:**

- `apps/web/src/components/app-shell/navigation.ts` — `roleNavigation.student`/`.teacher` are hardcoded arrays of `{label, href, icon}`, not derived from the enum. Needs new entries + new route files.
- `packages/database-platform/src/usage-reader.ts` — **both** `getWorkspaceUsageStats` (admin dashboard cards) and `getTopContributors` (leaderboard) have hardcoded per-kind query blocks and a hand-built literal return array (`{workspace: "sql-workbench", ...}` etc.) — see §3 below for the exact new blocks needed.
- `apps/web/src/components/admin/workspace-usage-card.tsx` — hardcoded `workspaceIcons: Record<WorkspaceKind, typeof Database>` icon map (TS forces a new entry).
- `apps/web/src/components/admin/top-contributors-view.tsx` — hardcoded `breakdownFields` array of `{key, label, icon}` rendered per contributor row.
- `packages/contracts/src/admin.ts` — `userUsageSummarySchema` and `topContributorRecordSchema` need a new field added.

Confirmed current shape of both schemas (`packages/contracts/src/admin.ts`, direct read):

```ts
export const userUsageSummarySchema = z.object({
  workspaceState: workspaceStateSchema.nullable(),
  erdDiagramCount: z.number().int().nonnegative(),
  codeFileCount: z.number().int().nonnegative(),
  savedQueryCount: z.number().int().nonnegative(),
  sqlExecutionCount: z.number().int().nonnegative(),
  codeExecutionCount: z.number().int().nonnegative(),
  guiSessionCount: z.number().int().nonnegative(),
  lastActiveAt: z.iso.datetime({ offset: true }).nullable(),
});

export const topContributorRecordSchema = z.object({
  id: z.string().uuid(),
  rank: z.number().int().positive(),
  displayName: z.string(),
  sectionName: z.string().nullable(),
  contributionScore: z.number().int().nonnegative(),
  successfulWorkCount: z.number().int().nonnegative(),
  sqlExecutionCount: z.number().int().nonnegative(),
  codeExecutionCount: z.number().int().nonnegative(),
  erdDiagramCount: z.number().int().nonnegative(),
  savedQueryCount: z.number().int().nonnegative(),
  guiSessionCount: z.number().int().nonnegative(),
});
```

Add `webFileCount: z.number().int().nonnegative()` to **both** (use this exact same field name in both places — don't invent two different names for the same concept).

### Live preview — genuinely new code, but fully unblocked

- Zero existing iframe/`srcdoc`/`sandbox`/`Blob`/`postMessage`/`createObjectURL` code anywhere in `apps/web/src` (confirmed via exhaustive grep — zero matches). The one GUI-adjacent workspace (`java-gui-workbench`) uses noVNC canvas rendering over a WebSocket, which is unrelated and not reusable here.
- No CSP, `X-Frame-Options`, or `frame-ancestors` directive anywhere in `apps/web/next.config.ts` or `infrastructure/vps/nginx/codeforge.conf` (confirmed via grep, zero matches) — nothing currently blocks a sandboxed iframe. If a CSP is added to the app in the future, it will need a `frame-src 'self'` (or equivalent) allowance for `srcdoc` content — not a current blocker, just a forward-looking note.

### Production migration gotcha (found during plan review — this is real and must not be skipped)

`infrastructure/vps/DEPLOY.md` (confirmed by direct read, "## 5. First deploy" section):

> The `mysql` container applies every file in `packages/database-platform/migrations/` on this **first boot only** (standard `docker-entrypoint-initdb.d` behavior — it does not re-run on restart, only on a genuinely empty data volume).

The live production VPS database has been running with real data since 2026-08-26. **A redeploy alone will NOT create the new `web_workspaces` table** — the new migration file must be applied by hand against the already-running production `mysql` container before `platform-api` is restarted with the new code, or every new route will fail with a 500 against a missing table. See §9 for the exact deployment sequence.

---

## 1. Contracts (`packages/contracts`)

### New file: `packages/contracts/src/web-workspace.ts`

```ts
import { z } from "zod";

const webFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/\.(html|css|js)$/i, "File name must end in .html, .css, or .js");

const webFolderNameSchema = z.string().trim().min(1).max(200);

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
  javascript: { monacoId: "javascript", extension: "js", label: "JavaScript" },
};

// Pure, name-only derivation — never a stored field, so a rename can never
// desync "kind" from what the file's actual name says.
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
```

Register with `export * from "./web-workspace";` in `packages/contracts/src/index.ts`.

### `packages/contracts/src/workspace-kind.ts`

Add `"web-workspace"` to the enum array and `"web-workspace": "Web Workspace"` to `workspaceKindLabels` (exact edit shown above under "Confirmed facts").

### `packages/contracts/src/admin.ts`

Add `webFileCount: z.number().int().nonnegative()` to both `userUsageSummarySchema` and `topContributorRecordSchema` (see exact current shapes above).

---

## 2. Backend

### `packages/database-platform/src/schema.ts`

Add a `webWorkspaces` table — structural copy of `codeWorkspaces`:

```ts
export const webWorkspaces = mysqlTable(
  "web_workspaces",
  {
    id: char("id", { length: 36 }).primaryKey(),
    institutionId: char("institution_id", { length: 36 })
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    ownerId: char("owner_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    content: json("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [uniqueIndex("web_workspaces_owner_uq").on(table.ownerId)],
);
```

Add `webWorkspaces` to the `platformSchema` export object (alphabetical slot: between `users` and `workspaceAllocations`).

### New migration: `packages/database-platform/migrations/0014_web_workspace.sql`

(0014 confirmed as the next free number — files 0001 through 0013 exist, most recent is `0013_gui_sessions.sql`.)

```sql
CREATE TABLE web_workspaces (
  id CHAR(36) PRIMARY KEY,
  institution_id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  content JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY web_workspaces_owner_uq (owner_id),
  CONSTRAINT web_workspaces_institution_fk FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
  CONSTRAINT web_workspaces_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);
```

### New repository: `packages/database-platform/src/web-workspace-repository.ts`

Literal copy of `MySqlCodeWorkspaceRepository` (in `code-workspace-repository.ts`), renamed `MySqlWebWorkspaceRepository`, importing `webWorkspaces`/`WebWorkspaceContent` instead of the code-workspace equivalents. Same three methods: `findByOwner`, `getOrCreate(institutionId, ownerId, blankContent)`, `save(institutionId, ownerId, content)`. Export from `packages/database-platform/src/index.ts`.

### New service package: `packages/web-workspace` (mirrors `packages/code-workspace`)

- `package.json` — name `@sqweb/web-workspace`, deps `@sqweb/auth` + `@sqweb/contracts`, same `test`/`typecheck` scripts as `packages/code-workspace/package.json`.
- `src/types.ts` — `WebWorkspaceRepository` interface (`getOrCreate`, `save`) and `WebWorkspaceServiceDependencies` (`identity.requireActiveAccount`, `workspaces`).
- `src/web-workspace-service.ts` — `WebWorkspaceService` class with `get(identity)` / `save(identity, request)`, calling `requireActiveAccount(identity, ["student", "teacher"])` then delegating to the repository — copy `CodeWorkspaceService`'s structure exactly.
- `src/index.ts` — re-export.

**Seed content** — the blank/initial workspace should be a real linked 3-file starter (not an empty tree), so the linking feature is demonstrated on first load:

```ts
const blankContent: WebWorkspaceContent = {
  root: {
    id: "root",
    kind: "folder",
    name: "My files",
    children: [
      {
        id: "seed-folder",
        kind: "folder",
        name: "My website",
        children: [
          {
            id: "seed-html",
            kind: "file",
            name: "index.html",
            sourceCode:
              '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello, CodeForge</h1>\n  <script src="app.js"></script>\n</body>\n</html>\n',
          },
          {
            id: "seed-css",
            kind: "file",
            name: "style.css",
            sourceCode:
              "body {\n  font-family: sans-serif;\n  text-align: center;\n  margin-top: 3rem;\n}\n",
          },
          {
            id: "seed-js",
            kind: "file",
            name: "app.js",
            sourceCode:
              'document.querySelector("h1").addEventListener("click", () => {\n  alert("Linked!");\n});\n',
          },
        ],
      },
    ],
  },
  expanded: ["seed-folder"],
  openFileIds: ["seed-html"],
  activeFileId: "seed-html",
};
```

### Routes: `apps/platform-api/src/server.ts`

Mirror the `/v1/code-workspace` block exactly (see the exact current block quoted above under "Confirmed facts"):

```ts
server.get("/v1/web-workspace", async (request) => {
  const verified = await dependencies.identity.verifyBearer(
    request.headers.authorization,
  );
  await dependencies.section.assertWorkspaceUnlocked(verified, "web-workspace");
  return dependencies.webWorkspace.get(verified);
});

server.put("/v1/web-workspace", async (request) => {
  const verified = await dependencies.identity.verifyBearer(
    request.headers.authorization,
  );
  await dependencies.section.assertWorkspaceUnlocked(verified, "web-workspace");
  const body = webWorkspaceSaveRequestSchema.parse(request.body);
  return dependencies.webWorkspace.save(verified, body);
});
```

Add `webWorkspace: WebWorkspaceService` to the server's `dependencies` interface (near `codeWorkspace`), and import `webWorkspaceSaveRequestSchema` from `@sqweb/contracts`.

### Wiring: `apps/platform-api/src/main.ts`

```ts
import { WebWorkspaceService } from "@sqweb/web-workspace";
import { MySqlWebWorkspaceRepository } from "@sqweb/database-platform"; // add to existing import
...
const webWorkspace = new WebWorkspaceService({
  identity,
  workspaces: new MySqlWebWorkspaceRepository(database),
});
...
const server = await buildServer({ ..., codeWorkspace, webWorkspace, ... });
```

Add `"@sqweb/web-workspace": "0.1.0"` to `apps/platform-api/package.json` dependencies (next to the existing `"@sqweb/code-workspace": "0.1.0"` entry).

### Local dev migration script — required, easy to miss

`scripts/apply-workspace-migration-local.ts` hardcodes every migration as an idempotent block (checks `information_schema.tables`, applies the `.sql` file if missing). **Add a new block** for `web_workspaces`, or `npm run local:migrate:workspace` will never create the table locally and nothing will be testable end-to-end:

```ts
const [webWorkspaceTables] = await connection.query<RowDataPacket[]>(
  `SELECT COUNT(*) AS count FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'web_workspaces'`,
);
if (Number(webWorkspaceTables[0]?.count ?? 0) === 0) {
  const webWorkspaceMigration = await readFile(
    new URL(
      "../packages/database-platform/migrations/0014_web_workspace.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await connection.query(webWorkspaceMigration);
  console.log("Web workspace migration applied.");
}
```

Append right before the `finally` in `main()`, after the existing `0013_gui_sessions.sql` block.

### Tests to add (mirroring existing coverage)

- `packages/web-workspace/src/web-workspace-service.test.ts` — copy `code-workspace-service.test.ts`, swap types.
- `apps/platform-api/src/server.test.ts` — copy the existing `/v1/code-workspace` GET/PUT test block as a `/v1/web-workspace` block with a mocked `WebWorkspaceRepository`.

---

## 3. Admin dashboard integration

All in `packages/database-platform/src/usage-reader.ts`. Import `webWorkspaces` and `countWebWorkspaceFiles`/`WebWorkspaceContent` at the top of the file.

### `getUsageForOwner` (single-user detail panel)

Add a query paired exactly like the existing `codeWorkspaceRow` query:

```ts
this.database
  .select({ content: webWorkspaces.content, updatedAt: webWorkspaces.updatedAt })
  .from(webWorkspaces)
  .where(eq(webWorkspaces.ownerId, ownerId)),
```

Add its result to the destructured `Promise.all` array and to `candidateTimestamps`, and add to the returned object:

```ts
webFileCount: webWorkspaceRow
  ? countWebWorkspaceFiles((webWorkspaceRow.content as WebWorkspaceContent).root)
  : 0,
```

### `getWorkspaceUsageStats` (admin dashboard cards)

Add a 6th total+14-day-daily pair modeled on the **`erdTotal`/`erdDaily` block** (a simple `COUNT(*)`, NOT the execution-history-style blocks used for `queryExecutions`/`codeExecutions`):

```ts
this.database
  .select({ count: sql<number>`COUNT(*)` })
  .from(webWorkspaces)
  .where(eq(webWorkspaces.institutionId, institutionId)),
this.database
  .select({ day: sql`DATE(${webWorkspaces.updatedAt})`, count: sql<number>`COUNT(*)` })
  .from(webWorkspaces)
  .where(and(eq(webWorkspaces.institutionId, institutionId), gte(webWorkspaces.updatedAt, since)))
  .groupBy(sql`DATE(${webWorkspaces.updatedAt})`),
```

**Important detail:** bucket the daily counts by `updatedAt`, **not** `createdAt`. Unlike `savedQueries` (a genuine multi-row history table, correctly bucketed by `createdAt`), `web_workspaces` is a single-row-per-owner content blob — "activity that day" only makes sense as "was this workspace touched that day," matching how `codeWorkspaces` itself is treated. This is a one-line detail that's easy to get backwards.

Add the two new results to the `Promise.all` destructuring (e.g. `webTotal, webDaily`) and append to the returned array:

```ts
{
  workspace: "web-workspace",
  totalCount: Number(webTotal[0]?.count ?? 0),
  dailyCounts: toDailyCounts(webDaily),
},
```

### `getTopContributors` (leaderboard)

Add a `webCounts` query modeled on `erdCounts`/`savedCounts` (owner-grouped `COUNT(*)`, **no** `successful` sub-aggregate — there's nothing to judge):

```ts
this.database
  .select({ ownerId: webWorkspaces.ownerId, total: sql<number>`COUNT(*)` })
  .from(webWorkspaces)
  .where(eq(webWorkspaces.institutionId, institutionId))
  .groupBy(webWorkspaces.ownerId),
```

Build `webByOwner = new Map(webCounts.map((row) => [row.ownerId, Number(row.total)]))`, then in the per-student `.map`:

```ts
const webFileCount = webByOwner.get(student.id) ?? 0;
...
contributionScore:
  sqlExecutionCount + codeExecutionCount + erdDiagramCount +
  savedQueryCount + guiSessionCount + webFileCount,
successfulWorkCount: /* UNCHANGED — do NOT add webFileCount here */
  Number(sqlRow?.successful ?? 0) + Number(codeRow?.successful ?? 0) + Number(guiRow?.successful ?? 0),
...
webFileCount, // add to the returned object
```

### `resetActivityHistory` — no changes needed

It only clears execution-history tables (`queryExecutions`/`codeExecutions`/`guiSessions`). `web_workspaces` content must persist across a reset, exactly like `erdDiagrams`/`savedQueries`/`codeWorkspaces` content does today. Do not add `web_workspaces` here.

### `packages/contracts/src/admin.ts`

As in §1: `webFileCount` added to both schemas.

### `apps/web/src/components/admin/workspace-usage-card.tsx`

Add one entry to the hardcoded icon map (TypeScript will refuse to compile without it):

```ts
import { Globe } from "lucide-react"; // every other obvious icon (Database, Code2, Network, Bookmark, AppWindow) is already taken
const workspaceIcons: Record<WorkspaceKind, typeof Database> = {
  ...
  "web-workspace": Globe,
};
```

### `apps/web/src/components/admin/top-contributors-view.tsx`

Add one entry to `breakdownFields` and widen its `key` union type:

```ts
const breakdownFields: readonly {
  key: keyof Pick<
    TopContributorRecord,
    | "sqlExecutionCount"
    | "codeExecutionCount"
    | "erdDiagramCount"
    | "savedQueryCount"
    | "guiSessionCount"
    | "webFileCount"
  >;
  label: string;
  icon: typeof Database;
}[] = [...{ key: "webFileCount", label: "Web", icon: Globe }];
```

---

## 4. Frontend

### 4a. Extract shared tree utilities first (isolated refactor, do this before anything else frontend-related)

Both `code-workbench.tsx`'s six inline functions (lines 83-147) and the new `web-workbench.tsx` need **identical** recursive tree logic, differing only in node type. Extract a generic module `apps/web/src/lib/tree-nodes.ts`:

```ts
export interface BaseFileNode {
  readonly id: string;
  readonly kind: "file";
}
export interface BaseFolderNode<TNode> {
  readonly id: string;
  readonly kind: "folder";
  readonly name: string;
  children: TNode[];
}

export function findNode<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(node: TFile | TFolder, id: string): TFile | TFolder | null {
  /* verbatim body from code-workbench.tsx's findNode */
}

export function findParentId<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(folder: TFolder, id: string): string | null {
  /* verbatim body from findParentId */
}

export function mapNode<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(
  node: TFile | TFolder,
  id: string,
  fn: (node: TFile | TFolder) => TFile | TFolder,
): TFile | TFolder {
  /* verbatim body from mapNode */
}

export function insertChild<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(
  node: TFile | TFolder,
  parentId: string,
  child: TFile | TFolder,
): TFile | TFolder {
  /* verbatim body from insertChild */
}

export function removeNode<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(node: TFile | TFolder, id: string): TFile | TFolder {
  /* verbatim body from removeNode */
}

export function collectFileIds<
  TFile extends BaseFileNode,
  TFolder extends BaseFolderNode<TFile | TFolder>,
>(node: TFile | TFolder): string[] {
  /* verbatim body from collectFileIds */
}
```

Each function body should be a byte-for-byte copy of the existing implementation in `code-workbench.tsx` (lines 83-147), just with `CodeNode`/`CodeFolderNode` replaced by the generic type parameters. **This requires editing `code-workbench.tsx` itself**: delete its six local functions, keep its local `CodeFileNode`/`CodeFolderNode`/`CodeNode` types (they already satisfy the generic constraints structurally), and import the six functions from `@/lib/tree-nodes` instead.

**Run `code-workbench.test.tsx` immediately after this refactor** to confirm zero behavior change before writing anything new-feature-specific — this touches an already-shipped, tested, live component and should be its own isolated commit.

Add `apps/web/src/lib/tree-nodes.test.ts` with minimal generic-node fixtures covering each of the six functions — this is now a shared, load-bearing utility for two features, not internal-only to one, and deserves direct test coverage.

_(Optional, lower priority, do not let it block anything else: the resizable-pane drag/keyboard logic in `code-workbench.tsx` — `sidebarWidth`/`beginHorizontalResize`/`resizeSidebarByKeyboard` and the vertical equivalent — is also duplicated-in-waiting, since Web Workspace needs the same behavior for two pane boundaries instead of one. A small `apps/web/src/lib/use-resizable-panel.ts` hook would remove ~55 duplicated lines total, but this is UI polish, not correctness-critical — fine to inline-duplicate for now and extract later if there's time.)_

### 4b. New component: `apps/web/src/components/web-workbench/web-workbench.tsx`

Modeled on `code-workbench.tsx` minus all interactive-run/console machinery (none needed — there's no "run," live preview replaces it entirely) plus the new preview pane.

**State**: `root` (WebFolderNode), `expanded`, `openFileIds`, `activeFileId`, `loadState`, `saveStatus`, `draft`, `renamingId`/`renameValue`, pane sizes, `fullScreen`, `mobileFilesOpen` (mirrors Code Workspace's mobile drawer state), plus new: `mobilePane: "code" | "preview"` (the narrow-viewport tab switcher — see mobile layout below), `previewFileId` (see below), `previewVersion: number` (bumped to force a hard iframe reload).

**Load/save**: identical fetch-on-mount against `GET /v1/web-workspace`, identical 300ms-debounced autosave `PUT /v1/web-workspace` keyed off `[root, expanded, openFileIds, activeFileId]` — copy the pattern verbatim from `code-workbench.tsx`, swap the endpoint and schema (`webWorkspaceSchema`).

**Tree mutation handlers** (`toggleExpanded`, `startCreate`, `commitDraft`, `deleteNode`, `startRename`, `commitRename`, `openFile`, `closeTab`) — same as Code Workspace, but **`commitDraft`/`commitRename` gain file-name validation**: since there's no language dropdown to guarantee a valid extension the way Code Workspace has, call `webFileKindFromName(trimmedName)` before creating/renaming a file node. If it returns `null`, do **not** commit — set an inline error string on the draft/rename state (e.g. "File name must end in .html, .css, or .js") and keep the form open for correction, rather than silently falling back to a default name. Folder name validation stays trivial (non-empty, matches `webFolderNameSchema`).

**Editor pane**: reuse `CodeEditor` from `code-workbench/code-editor.tsx` as-is (already takes a raw `language: string`, no per-language special-casing):

```tsx
<CodeEditor
  key={activeFile.id}
  value={activeFile.sourceCode}
  language={
    webFileKindMeta[webFileKindFromName(activeFile.name) ?? "html"].monacoId
  }
  onChange={updateActiveSource}
/>
```

No `onRunShortcut` — there's no "run."

**Preview assembly + iframe** — the genuinely new piece:

`previewFileId` tracking: defaults to the first `.html` file found via pre-order traversal of `root` (preferring one literally named `index.html` if present); updates to follow `activeFileId` **only** when the user opens/activates an `.html` file — editing a `.css`/`.js` file should leave `previewFileId` pointed at the last-viewed HTML page, not blank the preview. If no `.html` file exists anywhere in the tree, render an empty state ("Create an .html file to see a live preview") instead of an iframe.

Assembly algorithm — use the browser's built-in `DOMParser` (not hand-rolled regex/string replacement) so it correctly handles arbitrary attribute order/quoting/whitespace the way a real browser would, directly serving the "really links them together like a browser" requirement:

```ts
function assemblePreviewDocument(
  entryHtml: string,
  filesByName: Map<string, string>,
): string {
  const doc = new DOMParser().parseFromString(entryHtml, "text/html");

  doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute("href");
    const fileName = href?.split("/").pop()?.toLowerCase();
    const css = fileName ? filesByName.get(fileName) : undefined;
    if (css === undefined) return; // not a sibling file — leave alone (e.g. a CDN stylesheet)
    const style = doc.createElement("style");
    style.textContent = css;
    link.replaceWith(style);
  });

  doc.querySelectorAll("script[src]").forEach((scriptTag) => {
    const src = scriptTag.getAttribute("src");
    const fileName = src?.split("/").pop()?.toLowerCase();
    const js = fileName ? filesByName.get(fileName) : undefined;
    if (js === undefined) return; // leave external <script src> tags untouched
    const script = doc.createElement("script");
    script.textContent = js;
    scriptTag.replaceWith(script);
  });

  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}
```

`filesByName` is built once per assembly via a pre-order DFS over `root`, keyed by lowercased file `name` — this is the flat-by-filename matching described in the v1 scope-limits section. Unresolved references (CDN links, external scripts) are deliberately left untouched — the sandboxed iframe retains normal outbound network access (sandboxing without `allow-same-origin` blocks reaching the _parent's_ origin/storage, not the iframe's own network fetches), so CDN references keep working exactly like a real browser tab.

Live-reload: a `useEffect` debounced 300-500ms (same debounce constant as autosave) recomputes `assemblePreviewDocument(...)` whenever `root` or `previewFileId` changes, storing the result in `previewHtml` state and incrementing `previewVersion`:

```tsx
<iframe
  key={previewVersion}
  sandbox="allow-scripts"
  srcDoc={previewHtml}
  title="Live preview"
/>
```

Keying on `previewVersion` guarantees every reload is a genuinely fresh browsing context (timers/state cleared), not a same-string no-op. A manual "Refresh" icon button (mirror the existing `RotateCcw`/`Maximize2` toolbar button style) skips the debounce and bumps `previewVersion` immediately, for resetting JS state (`setInterval`, `localStorage`-adjacent behavior) without an actual content change.

**Implementation caution**: `DOMParser` is browser-only. Keep all preview-assembly calls inside `useEffect`s (never at module scope or inline during render) so nothing runs during Next.js SSR — mirrors how `code-editor.tsx` already guards Monaco's dynamic import inside a `useEffect`.

**Desktop layout**: three resizable panes (file tree | editor | preview), each boundary a `role="separator"` using the same drag+keyboard pattern as Code Workspace's existing sidebar separator.

**Mobile layout** (this must be verified on a real device, not just devtools emulation — see §8):

- File tree: same off-canvas drawer pattern Code Workspace already uses (`mobileFilesOpen` + a "Files" toolbar button) — do not invent a new pattern here, mirror the existing one exactly.
- Editor/preview: collapse into a two-tab segmented control ("Code" / "Preview") since three simultaneous columns don't fit a phone screen — default tab "Code". Both tabs must be fully usable by touch: Monaco needs to actually accept touch/on-screen-keyboard input, and the preview iframe needs to render and be scrollable/interactive without horizontal overflow.
- Watch specifically for horizontal overflow — this exact class of bug (a missing `min-w-0` on a flex/grid child causing modal/panel overflow) has been hit and fixed once before in this project; the three-pane-collapsing-to-tabs layout is a plausible place for it to recur.

**No PDF export, no "Run" button, no console.** Toolbar only has: Refresh (preview), Files (mobile), fullscreen toggle, save-status indicator (reuse the existing "saved / saving… / couldn't save" text pattern verbatim).

### File-tree UI in `web-workbench.tsx`

Same rendering approach as `code-workbench.tsx`'s `renderNode`/`renderDraftRow` (folder rows with expand/collapse chevrons, file rows with rename/delete affordances), but the draft-creation form **drops the language `<select>` entirely** (no dropdown — just a Name field), showing the inline validation error described above when the typed name doesn't end in `.html`/`.css`/`.js`.

---

## 5. Nav + routes

### `apps/web/src/components/app-shell/navigation.ts`

Add one entry to both `roleNavigation.student` and `roleNavigation.teacher` arrays, positioned right after "Code Workspace":

```ts
import { Globe } from "lucide-react"; // reuse the same icon used in workspace-usage-card.tsx for consistency
...
{ label: "Web Workspace", href: "/student/web-workspace", icon: Globe },
// ...and the teacher equivalent:
{ label: "Web Workspace", href: "/teacher/web-workspace", icon: Globe },
```

### New route files (mirror the `code-workspace` pair exactly)

`apps/web/src/app/student/web-workspace/page.tsx`:

```tsx
import { WebWorkbench } from "@/components/web-workbench/web-workbench";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { WorkspaceLockGate } from "@/components/workspace/workspace-lock-gate";

export default function StudentWebWorkspacePage() {
  return (
    <ProtectedRolePage role="student">
      <AppShell
        role="student"
        activeHref="/student/web-workspace"
        eyebrow="Student workspace"
        pageTitle="Web Workspace"
      >
        <WorkspaceLockGate workspace="web-workspace">
          <WebWorkbench />
        </WorkspaceLockGate>
      </AppShell>
    </ProtectedRolePage>
  );
}
```

`apps/web/src/app/teacher/web-workspace/page.tsx` — identical structure but `role="teacher"`, **no** `WorkspaceLockGate` wrapper (teachers aren't locked out of any workspace today, matching the existing Code Workspace teacher page).

No other route/nav files need touching — the admin lock dialog and `WorkspaceLockGate` are already generic (confirmed in §"Confirmed facts").

**Before writing any Next.js-specific route code**, check `apps/web/node_modules/next/dist/docs/` per this repo's own `apps/web/AGENTS.md` — this Next.js version has real, intentional breaking changes from typical App Router conventions that training data won't reflect.

---

## 6. Security model for the preview iframe (important — read carefully before implementing)

Sandbox attribute: **`sandbox="allow-scripts"` and nothing else.**

Do not add:

- `allow-same-origin` — this is the one to be most careful about. Combined with `allow-scripts`, this pairing is a well-documented sandbox-escape vector (a sandboxed-but-same-origin document can interact with the embedding page in ways the sandbox exists to prevent). Omitting it keeps the iframe's content at a forced opaque/unique origin with zero access to the parent CodeForge page's cookies, `localStorage`/`sessionStorage`, DOM, or any other same-origin-gated API.
- `allow-popups` / `allow-top-navigation` — omitted so a student's (or another student's shared/malicious) script can't pop up windows or navigate the real app away from under the viewer.
- `allow-forms` — omitted since there's no legitimate destination for a form submission in this context.

**Isolation properties to state explicitly in code comments, given the security sensitivity of rendering arbitrary user-authored script**: the iframe cannot read or write the parent page's cookies, localStorage, sessionStorage, or DOM; it cannot call back into the parent window via `window.parent`/`window.top` in any privileged way; each `srcDoc` (re)assignment (forced via the `key={previewVersion}` prop) gets a fresh global/execution context, so no state (timers, variables, in-memory data) survives a reload — which is the _correct_ semantic for a "reload the preview" action, not a bug.

**Outbound network access is NOT blocked** by this sandbox configuration — a student's CSS/JS can still fetch external resources (fonts, a CDN script referenced by a `<link>`/`<script src>` that didn't match a sibling file name). This is expected/desired (matches real browser behavior), but worth stating explicitly since "sandboxed" can be misread as "fully offline."

---

## 7. Build sequence

Each step should be independently `typecheck`+`test` clean before moving to the next, matching this repo's established workflow:

1. **Contracts** (§1) — new schema file, workspace-kind enum+label, admin.ts field additions. Expect `workspace-usage-card.tsx` and `top-contributors-view.tsx` to now fail to typecheck (by design — this forces step 9 to actually happen, not get silently skipped).
2. **Backend data layer** — schema.ts table, migration SQL, repository, `scripts/apply-workspace-migration-local.ts` block.
3. **Service package** (`packages/web-workspace`) + its tests.
4. **Routes + wiring** (`server.ts`, `main.ts`, package.json dependency, mirrored `server.test.ts` block). Good checkpoint: run `npm run local:db:up && npm run local:migrate:workspace && npm run dev:api:local`, then hit `GET /v1/web-workspace` by hand with a bearer token (curl) to confirm the seed content round-trips before touching any frontend code.
5. **Shared tree-utility extraction** (§4a) — pure refactor of `code-workbench.tsx`, zero behavior change. Run `code-workbench.test.tsx` immediately to confirm no regression before building anything new on top of it.
6. **Basic Web Workbench CRUD, no preview** — file tree, create/rename/delete with validation, Monaco editor, load/autosave against `/v1/web-workspace`, but the preview pane rendered as a static placeholder (no `DOMParser` logic yet). This isolates "does the CRUD/data layer work" from "does the preview assembly work" as two separately-verifiable steps.
7. **Preview rendering** — `assemblePreviewDocument`, the debounced recompute effect, the sandboxed iframe, the manual refresh button, the mobile editor/preview tab switcher. Manually verify in-browser per §8 before moving on — this is the genuinely novel piece with no existing reference implementation in the codebase to lean on.
8. **Nav + route wiring** (§5) — full click-through smoke test now possible end-to-end.
9. **Admin dashboard integration** (§3) — placed last deliberately, both because it depends on real `web_workspaces` rows existing to observe (from steps 4/8's manual testing) and because it's the widest-blast-radius, most mechanical step — best done once the core feature is confirmed working, so there's real data to verify the numbers against.
10. **Full verify pass** — `npm run verify` (format:check, lint, typecheck, test, build) across the whole monorepo as the final gate before touching production.

---

## 8. Verification (before touching production)

### Automated

`npm run verify` clean across the monorepo. Specifically confirm these pass in isolation: `@sqweb/contracts`, `@sqweb/database-platform`, `@sqweb/web-workspace`, `apps/platform-api`, and the new `apps/web/src/lib/tree-nodes.test.ts`.

### Manual, end-to-end (dev server)

1. `npm run local:db:up` then `npm run local:migrate:workspace` — confirm console output includes `"Web workspace migration applied."` and `web_workspaces` exists (`SHOW TABLES LIKE 'web_workspaces';`).
2. Start the API and web dev servers. Log in as a student.
3. Open "Web Workspace" from the nav — confirm the seeded `index.html`/`style.css`/`app.js` tree loads, `index.html` is the active/open tab, and the live preview renders "Hello, CodeForge" styled per `style.css`.
4. Click the rendered `<h1>` in the preview — confirm the seed's `app.js` click handler fires (`alert("Linked!")`), proving the script actually executed inside the sandboxed iframe and was correctly inlined via the `<script src="app.js">` reference.
5. Edit `style.css` (e.g. change the text color) — confirm the preview updates within ~500ms with no explicit save/run action, and confirm it's a genuine reload (not a partial DOM patch).
6. Edit `index.html` directly (e.g. add a `<p>` tag) — confirm the preview reflects it.
7. Create a file with an invalid name (e.g. `notes.txt`) — confirm the inline validation error appears and the file is **not** created; then create `page2.html` and `extra.js`, confirm both succeed.
8. Rename a `.css` file to remove its extension — confirm the rename is rejected with the same inline error.
9. Delete a file referenced by `index.html`'s `<link>`/`<script>` — confirm the preview leaves that specific reference unresolved rather than crashing.
10. Reload the whole page — confirm autosaved content from steps 5-9 persists.
11. Click "Refresh" on the preview toolbar with no pending edits — confirm the iframe visibly reloads (e.g. add a `console.log(Date.now())` to `app.js` and watch devtools show a fresh timestamp on each click, proving state was actually cleared).
12. Resize panes via drag and via keyboard (arrow keys on the separator).
13. As a teacher, confirm `/teacher/web-workspace` loads with no lock gate. As an admin, lock `web-workspace` for a section via the existing lock dialog, confirm the student view shows the "Workspace locked" overlay — this exercises the automatic `workspaceKindSchema.options`-driven plumbing with zero new logic.

### Mobile — real device required, not just devtools responsive mode

This project has an established pattern for exposing the dev server over the LAN to a real phone (used earlier for other features) — repeat it here specifically for Web Workspace, since Monaco touch input, iframe rendering, and the tab-switcher layout can behave meaningfully differently on real mobile Safari/Chrome than in desktop emulation:

- Confirm the file-tree drawer opens/closes cleanly by touch.
- Confirm the "Code"/"Preview" tab switcher works, and both tabs are actually usable — can type in Monaco with the on-screen keyboard, can see and interact with the live preview.
- Confirm nothing overflows horizontally anywhere in the layout.
- Confirm the preview iframe correctly handles touch events for anything interactive the student's own code adds (e.g. the seed's click handler, via tap instead of click).

### Admin dashboard

1. As admin, confirm a new "Web Workspace" usage card appears with a nonzero total and a populated 14-day sparkline.
2. Open "Top Contributors" — confirm the test student's row shows a "Web" breakdown entry with the correct file count, contributing to `contributionScore` but **not** `successfulWorkCount`.
3. Trigger "Reset activity" from the admin panel — confirm `web_workspaces` rows/content are untouched afterward (only `queryExecutions`/`codeExecutions`/`guiSessions` should be cleared).

**Only once `npm run verify` is clean AND the manual + mobile passes above are all done should this move to production.**

---

## 9. Production deployment

**This is the one place local-only testing is not enough.** The live VPS MySQL container has real data and has been running since 2026-08-26 — `docker-entrypoint-initdb.d` (what applies files in `packages/database-platform/migrations/`) only runs on a genuinely **empty** data volume, confirmed in `infrastructure/vps/DEPLOY.md`. A redeploy alone will **not** create `web_workspaces`; skipping the manual migration step below will make every new route 500 against a missing table the moment `platform-api` restarts with the new code.

Deployment order:

1. Commit and push to `main`.
2. **On the VPS, before restarting `platform-api`**: apply the new migration by hand against the already-running production `mysql` container. Confirm the exact container/credential names against `infrastructure/vps/docker-compose.prod.yml` and `.env.prod` at execution time, then something in the shape of:
   ```bash
   docker compose -f infrastructure/vps/docker-compose.prod.yml exec -T mysql \
     mysql -u root -p"$MYSQL_ROOT_PASSWORD" sqweb_platform \
     < packages/database-platform/migrations/0014_web_workspace.sql
   ```
   Verify the table now exists before proceeding (`docker compose ... exec mysql mysql -u root -p"..." sqweb_platform -e "SHOW TABLES LIKE 'web_workspaces';"`).
3. `git pull` on the VPS, then rebuild+restart **only `platform-api`** (the only backend service touched by this feature — `execution-api`, `interactive-run-api`, and `provisioning-worker` are all untouched):
   ```bash
   cd ~/CodeForge
   git pull
   docker compose -f infrastructure/vps/docker-compose.prod.yml --env-file infrastructure/vps/.env.prod up -d --build platform-api
   docker compose -f infrastructure/vps/docker-compose.prod.yml exec nginx nginx -s reload
   ```
4. Vercel auto-redeploys `apps/web` from the push — confirm the Deployments tab shows **Ready** on the new commit before considering this live.
5. **Retest the full manual + mobile checklist from §8 against the live site itself**, not just local dev, before calling this done.

Consider adding a short addendum to `infrastructure/vps/DEPLOY.md` documenting this manual-migration step for future incremental migrations too — the current runbook only documents the first-boot case, and this is the first migration shipped since the VPS went live.

---

## Critical files checklist

- `packages/contracts/src/web-workspace.ts` (new) — core schema
- `packages/contracts/src/workspace-kind.ts` — add enum value + label
- `packages/contracts/src/admin.ts` — add `webFileCount` to both usage schemas
- `packages/database-platform/src/schema.ts` — new `webWorkspaces` table
- `packages/database-platform/migrations/0014_web_workspace.sql` (new)
- `packages/database-platform/src/web-workspace-repository.ts` (new)
- `packages/database-platform/src/usage-reader.ts` — both `getWorkspaceUsageStats` and `getTopContributors` need a new query pair
- New package `packages/web-workspace` (mirrors `packages/code-workspace`)
- `apps/platform-api/src/server.ts` + `main.ts` — new routes + dependency wiring
- `apps/platform-api/package.json` — add `@sqweb/web-workspace` dependency
- `scripts/apply-workspace-migration-local.ts` — new idempotent migration block (required for local testing)
- `apps/web/src/components/code-workbench/code-workbench.tsx` — source of the six tree functions to extract (refactor target)
- New `apps/web/src/lib/tree-nodes.ts` — shared generic tree utilities
- New `apps/web/src/lib/tree-nodes.test.ts`
- New `apps/web/src/components/web-workbench/web-workbench.tsx` — the main new component
- `apps/web/src/components/app-shell/navigation.ts` — nav entries
- New `apps/web/src/app/student/web-workspace/page.tsx`
- New `apps/web/src/app/teacher/web-workspace/page.tsx`
- `apps/web/src/components/admin/workspace-usage-card.tsx` — icon map entry
- `apps/web/src/components/admin/top-contributors-view.tsx` — breakdown field entry
- `infrastructure/vps/DEPLOY.md` — optional addendum on the incremental-migration step
