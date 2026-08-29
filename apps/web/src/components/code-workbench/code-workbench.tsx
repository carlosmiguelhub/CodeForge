"use client";

import {
  apiErrorSchema,
  interactiveRunGrantResponseSchema,
  interactiveRunServerMessageSchema,
  codeLanguageMeta,
  codeWorkspaceSchema,
  type CodeLanguage,
} from "@sqweb/contracts";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Expand,
  File,
  FileDown,
  FilePlus2,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Maximize2,
  Pencil,
  Play,
  RotateCcw,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { randomId } from "@/lib/random-id";
import { interactiveRunSocketUrl } from "@/lib/interactive-run-url";
import { Spinner } from "@/components/ui/spinner";
import { CodeEditor, type CodeEditorController } from "./code-editor";
import { codeGuideSamples, codeGuideSections } from "./code-guide-content";
import { exportFileToPdf } from "./code-pdf-export";
import { GuideModal } from "../workbench/guide-modal";
import {
  InteractiveConsole,
  type InteractiveConsoleEntry,
} from "./interactive-console";

interface CodeFileNode {
  readonly id: string;
  readonly kind: "file";
  name: string;
  language: CodeLanguage;
  sourceCode: string;
}

interface CodeFolderNode {
  readonly id: string;
  readonly kind: "folder";
  name: string;
  children: CodeNode[];
}

type CodeNode = CodeFileNode | CodeFolderNode;

const languageOrder: readonly CodeLanguage[] = [
  "python",
  "java",
  "cpp",
  "javascript",
  "c",
];

const ROOT_ID = "root";

function defaultFileName(language: CodeLanguage) {
  return `solution.${codeLanguageMeta[language].extension}`;
}

function findNode(node: CodeNode, id: string): CodeNode | null {
  if (node.id === id) return node;
  if (node.kind === "folder") {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

function findParentId(node: CodeFolderNode, id: string): string | null {
  for (const child of node.children) {
    if (child.id === id) return node.id;
    if (child.kind === "folder") {
      const found = findParentId(child, id);
      if (found) return found;
    }
  }
  return null;
}

function mapNode(
  node: CodeNode,
  id: string,
  fn: (node: CodeNode) => CodeNode,
): CodeNode {
  if (node.id === id) return fn(node);
  if (node.kind === "folder") {
    return {
      ...node,
      children: node.children.map((child) => mapNode(child, id, fn)),
    };
  }
  return node;
}

function insertChild(
  node: CodeNode,
  parentId: string,
  child: CodeNode,
): CodeNode {
  if (node.kind !== "folder") return node;
  if (node.id === parentId)
    return { ...node, children: [...node.children, child] };
  return {
    ...node,
    children: node.children.map((c) => insertChild(c, parentId, child)),
  };
}

function removeNode(node: CodeNode, id: string): CodeNode {
  if (node.kind !== "folder") return node;
  return {
    ...node,
    children: node.children
      .filter((child) => child.id !== id)
      .map((child) => removeNode(child, id)),
  };
}

function collectFileIds(node: CodeNode): string[] {
  if (node.kind === "file") return [node.id];
  return node.children.flatMap(collectFileIds);
}

interface Draft {
  parentId: string;
  kind: "file" | "folder";
  name: string;
  language: CodeLanguage;
}

export function CodeWorkbench() {
  const { authorizedFetch, executionFetch, account } = useAuth();
  // Starts as an obviously-empty placeholder, not the seed content — the
  // real (possibly seeded) workspace loads moments later below, and
  // pre-filling this with fake-looking content would invite the student to
  // start typing into something the load response is about to overwrite.
  const [root, setRoot] = useState<CodeFolderNode>(() => ({
    id: ROOT_ID,
    kind: "folder",
    name: "My files",
    children: [],
  }));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [interactiveState, setInteractiveState] = useState<
    "idle" | "connecting" | "running" | "finished"
  >("idle");
  const [consoleEntries, setConsoleEntries] = useState<
    readonly InteractiveConsoleEntry[]
  >([]);
  const [consoleRun, setConsoleRun] = useState<{
    readonly fileId: string;
    readonly sourceCode: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(248);
  const [bottomHeight, setBottomHeight] = useState(260);
  const [fullScreen, setFullScreen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const editorRef = useRef<CodeEditorController>(null);
  const interactiveSocketRef = useRef<WebSocket | null>(null);
  const interactiveStopRequestedRef = useRef(false);

  useEffect(
    () => () => {
      interactiveSocketRef.current?.close();
    },
    [],
  );

  // Fetch the caller's one code workspace on mount — the server creates a
  // blank (seeded) one on first-ever read, so there's no separate "doesn't
  // exist yet" branch to handle here.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authorizedFetch("/v1/code-workspace");
        if (!response.ok)
          throw new Error("The code workspace could not be loaded.");
        const workspace = codeWorkspaceSchema.parse(await response.json());
        if (cancelled) return;
        setRoot(workspace.content.root as unknown as CodeFolderNode);
        setExpanded(new Set(workspace.content.expanded));
        setOpenFileIds([...workspace.content.openFileIds]);
        setActiveFileId(workspace.content.activeFileId);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  // Debounced autosave, same 300ms-after-last-change shape the previous
  // localStorage version used, just against the platform API instead.
  useEffect(() => {
    if (loadState !== "ready") return;
    const statusTimer = window.setTimeout(() => setSaveStatus("saving"), 0);
    const saveTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await authorizedFetch("/v1/code-workspace", {
            method: "PUT",
            body: JSON.stringify({
              content: {
                root,
                expanded: [...expanded],
                openFileIds,
                activeFileId,
              },
            }),
          });
          setSaveStatus(response.ok ? "saved" : "error");
        } catch {
          setSaveStatus("error");
        }
      })();
    }, 300);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(saveTimer);
    };
  }, [authorizedFetch, loadState, root, expanded, openFileIds, activeFileId]);

  const activeNode = activeFileId ? findNode(root, activeFileId) : null;
  const activeFile: CodeFileNode | null =
    activeNode?.kind === "file" ? activeNode : null;
  const openFiles = openFileIds
    .map((id) => findNode(root, id))
    .filter((node): node is CodeFileNode => node?.kind === "file");

  function updateActiveSource(sourceCode: string) {
    if (!activeFileId) return;
    setRoot(
      (current) =>
        mapNode(current, activeFileId, (node) =>
          node.kind === "file" ? { ...node, sourceCode } : node,
        ) as CodeFolderNode,
    );
  }

  function setActiveLanguage(language: CodeLanguage) {
    if (!activeFileId) return;
    setRoot(
      (current) =>
        mapNode(current, activeFileId, (node) =>
          node.kind === "file" ? { ...node, language } : node,
        ) as CodeFolderNode,
    );
    setLanguageMenuOpen(false);
  }

  function resetToTemplate() {
    if (!activeFile) return;
    updateActiveSource(codeLanguageMeta[activeFile.language].template);
  }

  function openFile(id: string) {
    setOpenFileIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setActiveFileId(id);
    setMobileFilesOpen(false);
  }

  function closeTab(id: string) {
    const next = openFileIds.filter((fileId) => fileId !== id);
    setOpenFileIds(next);
    if (id === activeFileId) setActiveFileId(next[next.length - 1] ?? "");
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startCreate(parentId: string, kind: "file" | "folder") {
    setExpanded((current) => new Set(current).add(parentId));
    setDraft({
      parentId,
      kind,
      name: kind === "file" ? defaultFileName("python") : "",
      language: "python",
    });
  }

  function updateDraftLanguage(language: CodeLanguage) {
    setDraft((current) => {
      if (!current) return current;
      const wasDefault = current.name === defaultFileName(current.language);
      return {
        ...current,
        language,
        name:
          wasDefault || current.name === ""
            ? defaultFileName(language)
            : current.name,
      };
    });
  }

  function commitDraft() {
    if (!draft) return;
    const trimmed = draft.name.trim();
    const name =
      trimmed ||
      (draft.kind === "folder"
        ? "New folder"
        : defaultFileName(draft.language));
    const node: CodeNode =
      draft.kind === "folder"
        ? { id: randomId(), kind: "folder", name, children: [] }
        : {
            id: randomId(),
            kind: "file",
            name,
            language: draft.language,
            sourceCode: codeLanguageMeta[draft.language].template,
          };
    setRoot(
      (current) => insertChild(current, draft.parentId, node) as CodeFolderNode,
    );
    if (node.kind === "file") {
      setOpenFileIds((current) => [...current, node.id]);
      setActiveFileId(node.id);
    } else {
      setExpanded((current) => new Set(current).add(node.id));
    }
    setDraft(null);
  }

  function deleteNode(id: string) {
    const node = findNode(root, id);
    if (!node) return;
    const removedFileIds = new Set(collectFileIds(node));
    setRoot((current) => removeNode(current, id) as CodeFolderNode);
    const next = openFileIds.filter((fileId) => !removedFileIds.has(fileId));
    setOpenFileIds(next);
    if (removedFileIds.has(activeFileId))
      setActiveFileId(next[next.length - 1] ?? "");
  }

  function startRename(node: CodeNode) {
    setRenamingId(node.id);
    setRenameValue(node.name);
  }

  function commitRename() {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) {
      setRoot(
        (current) =>
          mapNode(current, renamingId, (node) => ({
            ...node,
            name,
          })) as CodeFolderNode,
      );
    }
    setRenamingId(null);
  }

  function openSampleInNewTab(code: string) {
    const language = activeFile?.language ?? "python";
    const parentId =
      (activeFile && findParentId(root, activeFile.id)) ?? ROOT_ID;
    const node: CodeFileNode = {
      id: randomId(),
      kind: "file",
      name: defaultFileName(language),
      language,
      sourceCode: code,
    };
    setRoot(
      (current) => insertChild(current, parentId, node) as CodeFolderNode,
    );
    setExpanded((current) => new Set(current).add(parentId));
    setOpenFileIds((current) => [...current, node.id]);
    setActiveFileId(node.id);
    setGuideOpen(false);
  }

  function appendConsoleEntry(
    kind: InteractiveConsoleEntry["kind"],
    data: string,
  ) {
    setConsoleEntries((current) => [
      ...current,
      { id: randomId(), kind, data },
    ]);
  }

  async function runInteractively() {
    if (
      !activeFile ||
      interactiveState === "connecting" ||
      interactiveState === "running" ||
      !activeFile.sourceCode.trim()
    )
      return;

    const submittedFile = activeFile;
    interactiveStopRequestedRef.current = false;
    setConsoleRun({
      fileId: submittedFile.id,
      sourceCode: submittedFile.sourceCode,
    });
    setInteractiveState("connecting");
    setConsoleEntries([
      {
        id: randomId(),
        kind: "status",
        data:
          "Starting " +
          codeLanguageMeta[submittedFile.language].label +
          " interactive run…\n",
      },
    ]);
    try {
      const response = await authorizedFetch("/v1/interactive-run-grants", {
        method: "POST",
      });
      if (!response.ok) {
        const parsedError = apiErrorSchema.safeParse(
          await response.json().catch(() => null),
        );
        throw new Error(
          parsedError.success
            ? parsedError.data.error.message
            : "Interactive execution could not be authorized.",
        );
      }
      const grant = interactiveRunGrantResponseSchema.parse(
        await response.json(),
      );
      const socket = new WebSocket(interactiveRunSocketUrl(grant.token));
      interactiveSocketRef.current = socket;
      let terminalMessageReceived = false;
      let startedAtMs: number | null = null;

      socket.addEventListener("open", () => {
        if (interactiveStopRequestedRef.current) {
          socket.close();
          return;
        }
        setInteractiveState("running");
        startedAtMs = Date.now();
        socket.send(
          JSON.stringify({
            type: "start",
            language: submittedFile.language,
            sourceCode: submittedFile.sourceCode,
          }),
        );
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = interactiveRunServerMessageSchema.parse(
            JSON.parse(String(event.data)),
          );
          switch (message.type) {
            case "stdout":
            case "stderr":
              appendConsoleEntry(message.type, message.data);
              break;
            case "exit":
              terminalMessageReceived = true;
              setInteractiveState("finished");
              appendConsoleEntry(
                "status",
                "\n[Process exited with code " + message.exitCode + "]\n",
              );
              // Best-effort: this only feeds the admin dashboard and
              // leaderboard totals, never anything the student is waiting
              // on, so a failure here is silently dropped rather than
              // surfaced in the console.
              void executionFetch("/v1/interactive-run-history", {
                method: "POST",
                body: JSON.stringify({
                  language: submittedFile.language,
                  exitCode: message.exitCode,
                  timeMs: startedAtMs === null ? null : Date.now() - startedAtMs,
                }),
              }).catch(() => undefined);
              socket.close();
              break;
            case "error":
              terminalMessageReceived = true;
              setInteractiveState("finished");
              appendConsoleEntry("stderr", "\n[" + message.message + "]\n");
              socket.close();
              break;
          }
        } catch {
          terminalMessageReceived = true;
          setInteractiveState("finished");
          appendConsoleEntry("stderr", "\n[Invalid response from runner]\n");
          socket.close();
        }
      });
      socket.addEventListener("error", () => {
        if (terminalMessageReceived) return;
        terminalMessageReceived = true;
        setInteractiveState("finished");
        appendConsoleEntry("stderr", "\n[Interactive connection failed]\n");
      });
      socket.addEventListener("close", () => {
        if (interactiveSocketRef.current === socket)
          interactiveSocketRef.current = null;
        if (terminalMessageReceived) return;
        terminalMessageReceived = true;
        setInteractiveState("finished");
        appendConsoleEntry(
          "status",
          interactiveStopRequestedRef.current
            ? "\n[Run stopped]\n"
            : "\n[Interactive connection closed]\n",
        );
      });
    } catch (error) {
      setInteractiveState("finished");
      appendConsoleEntry(
        "stderr",
        "\n[" +
          (error instanceof Error
            ? error.message
            : "Interactive execution could not be started.") +
          "]\n",
      );
    }
  }

  function sendInteractiveInput(line: string) {
    const socket = interactiveSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "stdin", data: line + "\n" }));
    appendConsoleEntry("stdin", line + "\n");
  }

  function stopInteractiveRun() {
    interactiveStopRequestedRef.current = true;
    interactiveSocketRef.current?.close();
  }

  async function exportPdf() {
    if (!activeFile || exporting) return;
    const exportedFile = activeFile;
    const matchingConsoleEntries =
      consoleRun?.fileId === exportedFile.id &&
      consoleRun.sourceCode === exportedFile.sourceCode
        ? consoleEntries
        : [];
    setExporting(true);
    setExportError(null);
    try {
      await Promise.resolve();
      exportFileToPdf({
        fileName: exportedFile.name,
        sourceCode: exportedFile.sourceCode,
        consoleEntries: matchingConsoleEntries,
        authorName: account?.displayName ?? "Unknown",
        exportedAt: new Date(),
      });
    } catch {
      setExportError("The PDF could not be generated.");
    } finally {
      setExporting(false);
    }
  }

  function beginHorizontalResize(event: PointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (moveEvent: globalThis.PointerEvent) =>
      setSidebarWidth(
        Math.min(420, Math.max(190, startWidth + moveEvent.clientX - startX)),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resizeSidebarByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setSidebarWidth((value) =>
        Math.min(
          420,
          Math.max(190, value + (event.key === "ArrowRight" ? 16 : -16)),
        ),
      );
    }
  }

  function beginVerticalResize(event: PointerEvent<HTMLDivElement>) {
    const startY = event.clientY;
    const startHeight = bottomHeight;
    const move = (moveEvent: globalThis.PointerEvent) =>
      setBottomHeight(
        Math.min(
          520,
          Math.max(160, startHeight - (moveEvent.clientY - startY)),
        ),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resizePanelByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setBottomHeight((value) =>
        Math.min(
          520,
          Math.max(160, value + (event.key === "ArrowUp" ? 16 : -16)),
        ),
      );
    }
  }

  function renderDraftRow(depth: number) {
    if (!draft) return null;
    return (
      <div
        className="border-structural bg-elevated-high rounded-control my-1 space-y-2 border p-2"
        style={{ marginLeft: depth * 14 + 8 }}
      >
        <p className="text-ink-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase">
          {draft.kind === "folder" ? (
            <FolderClosed aria-hidden="true" size={12} />
          ) : (
            <File aria-hidden="true" size={12} />
          )}
          {draft.kind === "folder" ? "New folder" : "New file"}
        </p>

        {draft.kind === "file" ? (
          <label className="block">
            <span className="text-ink-muted mb-1 block text-[10px] font-medium">
              Language
            </span>
            <select
              aria-label="Language for the new file"
              value={draft.language}
              onChange={(event) =>
                updateDraftLanguage(event.target.value as CodeLanguage)
              }
              className="border-structural bg-elevated text-ink-primary rounded-control min-h-8 w-full border px-2 text-xs"
            >
              {languageOrder.map((language) => (
                <option key={language} value={language}>
                  {codeLanguageMeta[language].label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="text-ink-muted mb-1 block text-[10px] font-medium">
            Name
          </span>
          <input
            autoFocus
            value={draft.name}
            placeholder={draft.kind === "folder" ? "Folder name" : "File name"}
            onChange={(event) =>
              setDraft(
                (current) =>
                  current && { ...current, name: event.target.value },
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") commitDraft();
              if (event.key === "Escape") setDraft(null);
            }}
            className="border-structural bg-elevated text-ink-primary rounded-control min-h-8 w-full border px-2 text-xs outline-none"
          />
        </label>

        <div className="flex justify-end gap-1.5 pt-0.5">
          <button
            onClick={() => setDraft(null)}
            className="text-ink-muted rounded-control min-h-7 px-2.5 text-[11px]"
          >
            Cancel
          </button>
          <button
            onClick={commitDraft}
            className="bg-action rounded-control min-h-7 px-3 text-[11px] font-semibold text-white"
          >
            Create
          </button>
        </div>
      </div>
    );
  }

  function renderNode(node: CodeNode, depth: number) {
    if (node.kind === "folder") {
      const open = expanded.has(node.id);
      const isRenaming = renamingId === node.id;
      return (
        <div key={node.id}>
          <div
            className="group hover:bg-elevated rounded-control flex min-h-8 items-center gap-1 pr-1"
            style={{ paddingLeft: depth * 14 }}
          >
            <button
              onClick={() => toggleExpanded(node.id)}
              aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
              aria-expanded={open}
              className="text-ink-muted grid size-7 shrink-0 place-items-center"
            >
              {open ? (
                <ChevronDown aria-hidden="true" size={12} />
              ) : (
                <ChevronRight aria-hidden="true" size={12} />
              )}
            </button>
            {open ? (
              <FolderOpen
                aria-hidden="true"
                className="text-action-soft shrink-0"
                size={14}
              />
            ) : (
              <FolderClosed
                aria-hidden="true"
                className="text-action-soft shrink-0"
                size={14}
              />
            )}
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setRenamingId(null);
                }}
                onBlur={commitRename}
                className="border-structural bg-elevated text-ink-primary rounded-control min-h-6 min-w-0 flex-1 border px-1 text-xs outline-none"
              />
            ) : (
              <button
                onDoubleClick={() => startRename(node)}
                onClick={() => toggleExpanded(node.id)}
                className="text-ink-secondary min-w-0 flex-1 truncate py-1.5 text-left text-xs font-medium"
              >
                {node.name}
              </button>
            )}
            <div className="flex shrink-0 items-center gap-0.5 lg:hidden lg:group-hover:flex">
              <button
                onClick={() => startCreate(node.id, "file")}
                aria-label={`New file in ${node.name}`}
                className="text-ink-muted grid size-7 place-items-center"
              >
                <FilePlus2 aria-hidden="true" size={12} />
              </button>
              <button
                onClick={() => startCreate(node.id, "folder")}
                aria-label={`New folder in ${node.name}`}
                className="text-ink-muted grid size-7 place-items-center"
              >
                <FolderPlus aria-hidden="true" size={12} />
              </button>
              <button
                onClick={() => deleteNode(node.id)}
                aria-label={`Delete ${node.name}`}
                className="text-ink-muted hover:text-danger grid size-7 place-items-center"
              >
                <Trash2 aria-hidden="true" size={12} />
              </button>
            </div>
          </div>
          {open ? (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
              {draft?.parentId === node.id ? renderDraftRow(depth + 1) : null}
            </div>
          ) : null}
        </div>
      );
    }

    const isActive = node.id === activeFileId;
    const isRenaming = renamingId === node.id;
    return (
      <div
        key={node.id}
        className={`${isActive ? "bg-elevated" : "hover:bg-elevated"} group rounded-control flex min-h-8 items-center gap-1 pr-1`}
        style={{ paddingLeft: depth * 14 + 22 }}
      >
        <File
          aria-hidden="true"
          className="text-ink-muted shrink-0"
          size={13}
        />
        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") setRenamingId(null);
            }}
            onBlur={commitRename}
            className="border-structural bg-elevated text-ink-primary rounded-control min-h-6 min-w-0 flex-1 border px-1 text-xs outline-none"
          />
        ) : (
          <button
            onDoubleClick={() => startRename(node)}
            onClick={() => openFile(node.id)}
            className={`${isActive ? "text-ink-primary" : "text-ink-secondary"} flex min-h-8 min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs`}
          >
            <span className="truncate">{node.name}</span>
            <span className="text-ink-muted ml-auto font-mono text-[9px] uppercase">
              {codeLanguageMeta[node.language].extension}
            </span>
          </button>
        )}
        <div className="flex shrink-0 items-center gap-0.5 lg:hidden lg:group-hover:flex">
          <button
            onClick={() => startRename(node)}
            aria-label={`Rename ${node.name}`}
            className="text-ink-muted grid size-7 place-items-center"
          >
            <Pencil aria-hidden="true" size={11} />
          </button>
          <button
            onClick={() => deleteNode(node.id)}
            aria-label={`Delete ${node.name}`}
            className="text-ink-muted hover:text-danger grid size-7 place-items-center"
          >
            <Trash2 aria-hidden="true" size={11} />
          </button>
        </div>
      </div>
    );
  }

  const meta = activeFile ? codeLanguageMeta[activeFile.language] : null;

  return (
    <section
      className={`${fullScreen ? "bg-canvas fixed inset-0 z-50 p-3" : ""} border-structural bg-deep rounded-panel overflow-hidden border`}
      aria-label="Code Workbench"
    >
      <div className="border-divider bg-surface flex min-h-12 flex-wrap items-center gap-x-1 gap-y-2 border-b px-2 py-1.5">
        <button
          onClick={() => void runInteractively()}
          disabled={
            interactiveState === "connecting" ||
            interactiveState === "running" ||
            !activeFile
          }
          className="bg-action rounded-control flex min-h-9 items-center gap-2 px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {interactiveState === "connecting" ||
          interactiveState === "running" ? (
            <Spinner />
          ) : (
            <Play aria-hidden="true" size={14} />
          )}
          {interactiveState === "connecting"
            ? "Starting…"
            : interactiveState === "running"
              ? "Running…"
              : "Run"}
        </button>

        {activeFile && meta ? (
          <div className="relative">
            <button
              onClick={() => setLanguageMenuOpen((value) => !value)}
              aria-haspopup="listbox"
              aria-expanded={languageMenuOpen}
              className="border-structural text-ink-secondary rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs"
            >
              {meta.label}
              <ChevronDown aria-hidden="true" size={13} />
            </button>
            {languageMenuOpen ? (
              <div
                role="listbox"
                aria-label="Select language"
                className="border-structural bg-elevated rounded-control absolute top-full left-0 z-20 mt-1 w-40 border py-1 shadow-xl"
              >
                {languageOrder.map((language) => (
                  <button
                    key={language}
                    role="option"
                    aria-selected={activeFile.language === language}
                    onClick={() => setActiveLanguage(language)}
                    className={`${
                      activeFile.language === language
                        ? "text-ink-primary bg-elevated-high"
                        : "text-ink-secondary hover:bg-elevated-high"
                    } flex min-h-9 w-full items-center px-3 text-left text-xs`}
                  >
                    {codeLanguageMeta[language].label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          onClick={resetToTemplate}
          disabled={!activeFile}
          className="text-ink-secondary rounded-control flex min-h-9 items-center gap-2 px-3 text-xs disabled:opacity-50"
        >
          <RotateCcw aria-hidden="true" size={13} /> Reset
        </button>
        <button
          onClick={() => setMobileFilesOpen(true)}
          className="border-structural text-ink-secondary rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs lg:hidden"
        >
          <FolderClosed aria-hidden="true" size={14} /> Files
        </button>
        <button
          onClick={() => setGuideOpen(true)}
          className="text-action-soft rounded-control flex min-h-9 items-center gap-2 px-3 text-xs"
        >
          <CircleHelp aria-hidden="true" size={14} /> Guide
        </button>
        <button
          onClick={() => void exportPdf()}
          disabled={!activeFile || exporting}
          aria-label="Export PDF"
          className="text-ink-secondary rounded-control flex min-h-9 items-center gap-2 px-3 text-xs disabled:opacity-50"
        >
          {exporting ? <Spinner /> : <FileDown aria-hidden="true" size={14} />}
          {exporting ? "Exporting…" : "Export PDF"}
        </button>

        <span
          className={`${exportError ? "text-danger" : "text-ink-muted"} ml-auto hidden items-center gap-1.5 text-[11px] sm:flex`}
        >
          {loadState === "loading" || saveStatus === "saving" ? (
            <Spinner size={11} />
          ) : null}
          {exportError ??
            (loadState === "loading"
              ? "Loading your files…"
              : loadState === "error"
                ? "Couldn't load your files"
                : saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "error"
                    ? "Couldn't save"
                    : "Saved · Ctrl/Cmd + Enter to run")}
        </span>
        <button
          onClick={() => setFullScreen((value) => !value)}
          aria-label={fullScreen ? "Exit full screen" : "Open full screen"}
          className="text-ink-muted rounded-control ml-auto grid size-9 shrink-0 place-items-center sm:ml-0"
        >
          {fullScreen ? (
            <Expand aria-hidden="true" size={15} />
          ) : (
            <Maximize2 aria-hidden="true" size={15} />
          )}
        </button>
      </div>

      <div
        className="flex"
        style={{
          height: fullScreen ? "calc(100dvh - 72px)" : "min(680px, 78dvh)",
        }}
      >
        <aside
          className="border-divider bg-sidebar hidden shrink-0 overflow-auto border-r lg:block"
          style={{ width: sidebarWidth }}
          aria-label="File explorer"
        >
          <div className="border-divider flex items-center justify-between border-b px-3 py-2">
            <span className="text-ink-secondary flex items-center gap-2 text-xs font-semibold">
              <FolderClosed aria-hidden="true" size={14} /> Files
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => startCreate(ROOT_ID, "file")}
                aria-label="New file"
                className="text-ink-muted grid size-8 place-items-center"
              >
                <FilePlus2 aria-hidden="true" size={13} />
              </button>
              <button
                onClick={() => startCreate(ROOT_ID, "folder")}
                aria-label="New folder"
                className="text-ink-muted grid size-8 place-items-center"
              >
                <FolderPlus aria-hidden="true" size={13} />
              </button>
            </div>
          </div>
          <div className="p-2">
            {root.children.length === 0 && !draft ? (
              <p className="text-ink-muted px-2 py-3 text-[11px]">
                No files yet. Create one to get started.
              </p>
            ) : null}
            {root.children.map((child) => renderNode(child, 0))}
            {draft?.parentId === ROOT_ID ? renderDraftRow(0) : null}
          </div>
        </aside>
        <div
          role="separator"
          aria-label="Resize file explorer"
          aria-orientation="vertical"
          aria-valuemin={190}
          aria-valuemax={420}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={beginHorizontalResize}
          onKeyDown={resizeSidebarByKeyboard}
          className="bg-divider hover:bg-action hidden w-1 cursor-col-resize lg:block"
        />

        <div
          className="grid min-w-0 flex-1"
          style={{
            gridTemplateRows: `minmax(220px, 1fr) 4px ${bottomHeight}px`,
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-divider bg-panel flex h-10 items-end overflow-x-auto border-b">
              {openFiles.map((file) => (
                <div
                  key={file.id}
                  className={`${
                    file.id === activeFileId
                      ? "bg-deep text-ink-primary border-action"
                      : "text-ink-muted border-transparent"
                  } flex h-10 min-w-36 items-center justify-between gap-3 border-t-2 px-3 text-xs`}
                >
                  <button
                    aria-pressed={file.id === activeFileId}
                    onClick={() => setActiveFileId(file.id)}
                    className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Braces aria-hidden="true" size={12} />
                    <span className="truncate">{file.name}</span>
                  </button>
                  <button
                    aria-label={`Close ${file.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(file.id);
                    }}
                    className="grid size-7 shrink-0 place-items-center"
                  >
                    <X aria-hidden="true" size={12} />
                  </button>
                </div>
              ))}
            </div>
            {activeFile ? (
              <CodeEditor
                key={activeFile.id}
                ref={editorRef}
                value={activeFile.sourceCode}
                language={codeLanguageMeta[activeFile.language].monacoId}
                onChange={updateActiveSource}
                fontSize={13}
                onRunShortcut={() => void runInteractively()}
              />
            ) : (
              <div className="text-ink-muted grid h-full place-items-center p-8 text-xs">
                <div className="text-center">
                  <FolderOpen
                    aria-hidden="true"
                    className="mx-auto mb-2"
                    size={20}
                  />
                  Select a file from the sidebar, or create a new one.
                </div>
              </div>
            )}
          </div>

          <div
            role="separator"
            aria-label="Resize console panel"
            aria-orientation="horizontal"
            aria-valuemin={160}
            aria-valuemax={520}
            aria-valuenow={bottomHeight}
            tabIndex={0}
            onPointerDown={beginVerticalResize}
            onKeyDown={resizePanelByKeyboard}
            className="bg-divider hover:bg-action relative cursor-row-resize touch-none before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']"
          />

          <div className="border-divider bg-surface min-h-0 overflow-hidden border-t">
            <div className="border-divider text-ink-secondary flex min-h-10 items-center gap-2 border-b px-3 text-xs font-semibold">
              <Terminal aria-hidden="true" size={13} /> Console
            </div>
            <div className="h-[calc(100%-2.5rem)]">
              <InteractiveConsole
                entries={consoleEntries}
                state={interactiveState}
                onSubmit={sendInteractiveInput}
                onStop={stopInteractiveRun}
              />
            </div>
          </div>
        </div>
      </div>

      {guideOpen ? (
        <GuideModal
          title="Code Workspace guide"
          description="What you can do here, and a few starter programs per language."
          sections={codeGuideSections}
          samples={codeGuideSamples[activeFile?.language ?? "python"]}
          samplesTitle={`Sample programs (${
            codeLanguageMeta[activeFile?.language ?? "python"].label
          })`}
          onInsertSample={openSampleInNewTab}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}

      {mobileFilesOpen ? (
        <div
          className="bg-canvas/80 fixed inset-0 z-[55] flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="File explorer"
        >
          <aside className="border-structural bg-sidebar h-full w-[min(88vw,22rem)] overflow-auto border-r p-2">
            <div className="border-divider flex min-h-12 items-center justify-between border-b px-2">
              <span className="text-ink-primary text-sm font-semibold">
                File explorer
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => startCreate(ROOT_ID, "file")}
                  aria-label="New file"
                  className="text-ink-muted grid size-9 place-items-center"
                >
                  <FilePlus2 aria-hidden="true" size={14} />
                </button>
                <button
                  onClick={() => startCreate(ROOT_ID, "folder")}
                  aria-label="New folder"
                  className="text-ink-muted grid size-9 place-items-center"
                >
                  <FolderPlus aria-hidden="true" size={14} />
                </button>
                <button
                  onClick={() => setMobileFilesOpen(false)}
                  aria-label="Close file explorer"
                  className="text-ink-muted grid size-9 place-items-center"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </div>
            </div>
            <div className="p-1">
              {root.children.length === 0 && !draft ? (
                <p className="text-ink-muted px-2 py-3 text-[11px]">
                  No files yet. Create one to get started.
                </p>
              ) : null}
              {root.children.map((child) => renderNode(child, 0))}
              {draft?.parentId === ROOT_ID ? renderDraftRow(0) : null}
            </div>
          </aside>
          <button
            aria-label="Close file explorer"
            className="h-full flex-1"
            onClick={() => setMobileFilesOpen(false)}
          />
        </div>
      ) : null}
    </section>
  );
}
