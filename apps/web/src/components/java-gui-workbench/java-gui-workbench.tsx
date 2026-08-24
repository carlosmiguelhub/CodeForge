"use client";

import {
  guiSessionSchema,
  javaGuiWorkspaceSchema,
  type GuiSession,
  type JavaGuiFile,
} from "@sqweb/contracts";
import {
  Braces,
  CircleAlert,
  Expand,
  FilePlus2,
  Maximize2,
  MonitorPlay,
  Pencil,
  Play,
  Square,
  Star,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { guiSessionSocketUrl } from "@/lib/gui-execution-url";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";
import { randomId } from "@/lib/random-id";
import { CodeEditor, type CodeEditorController } from "../code-workbench/code-editor";
import { GuiViewport } from "./gui-viewport";

const ACTIVE_SESSION_STATES: readonly GuiSession["state"][] = [
  "requested",
  "provisioning",
  "running",
];

function nextFileName(existing: readonly JavaGuiFile[]): string {
  for (let index = 1; index <= existing.length + 1; index += 1) {
    const candidate = `Class${index}.java`;
    if (!existing.some((file) => file.name === candidate)) return candidate;
  }
  return "NewClass.java";
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function JavaGuiWorkbench() {
  const { authorizedFetch } = useAuth();
  const [files, setFiles] = useState<JavaGuiFile[]>([]);
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [mainFileId, setMainFileId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const editorRef = useRef<CodeEditorController>(null);

  const [session, setSession] = useState<GuiSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [panelTab, setPanelTab] = useState<"console" | "viewport">("console");
  const [consoleText, setConsoleText] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(
    null,
  );
  const consoleSocketRef = useRef<WebSocket | null>(null);

  // Fetch the caller's one Java GUI workspace on mount — the server
  // creates a blank (seeded, runnable) one on first-ever read.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authorizedFetch("/v1/gui-workspace");
        if (!response.ok)
          throw new Error("The Java GUI workspace could not be loaded.");
        const workspace = javaGuiWorkspaceSchema.parse(await response.json());
        if (cancelled) return;
        setFiles([...workspace.content.files]);
        setOpenFileIds([...workspace.content.openFileIds]);
        setActiveFileId(workspace.content.activeFileId);
        setMainFileId(workspace.content.mainFileId);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  // Debounced autosave, same shape as the Code Workspace's.
  useEffect(() => {
    if (loadState !== "ready") return;
    const statusTimer = window.setTimeout(() => setSaveStatus("saving"), 0);
    const saveTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await authorizedFetch("/v1/gui-workspace", {
            method: "PUT",
            body: JSON.stringify({
              content: { files, openFileIds, activeFileId, mainFileId },
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
  }, [authorizedFetch, loadState, files, openFileIds, activeFileId, mainFileId]);

  const closeConsoleSocket = () => {
    consoleSocketRef.current?.close();
    consoleSocketRef.current = null;
  };

  // Opened proactively right after a session is created (not lazily, like
  // the viewport) so compile errors show up immediately — see plan section
  // 4, step 3.
  const openConsoleSocket = (sessionId: string, grant: string) => {
    closeConsoleSocket();
    const socket = new WebSocket(guiSessionSocketUrl(sessionId, "console", grant));
    socket.onmessage = (event) => {
      setConsoleText((current) => current + String(event.data));
    };
    consoleSocketRef.current = socket;
  };

  useEffect(() => closeConsoleSocket, []);

  // Live-reflects provisioning progress and the eventual terminal state
  // (running / failed / expired / stopped) without a manual refresh.
  usePolling(
    () => void pollSession(),
    DEFAULT_POLL_INTERVAL_MS,
    session !== null && ACTIVE_SESSION_STATES.includes(session.state),
    false,
  );

  async function pollSession() {
    if (!session) return;
    try {
      const response = await authorizedFetch(`/v1/gui-sessions/${session.id}`);
      if (!response.ok) return;
      const updated = guiSessionSchema.parse(await response.json());
      setSession((current) => ({ ...updated, grant: current?.grant ?? null }));
      if (updated.state === "running") setPanelTab("viewport");
    } catch {
      // Transient — the next poll tick retries.
    }
  }

  useEffect(() => {
    if (!session?.endsAt || session.state !== "running") {
      const timer = window.setTimeout(() => setRemainingSeconds(null), 0);
      return () => window.clearTimeout(timer);
    }
    const endsAtMs = new Date(session.endsAt).getTime();
    const tick = () =>
      setRemainingSeconds(Math.max(0, Math.round((endsAtMs - Date.now()) / 1000)));
    const timer = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(id);
    };
  }, [session?.endsAt, session?.state]);

  const activeFile = files.find((file) => file.id === activeFileId) ?? null;
  const openFiles = openFileIds
    .map((id) => files.find((file) => file.id === id))
    .filter((file): file is JavaGuiFile => file !== undefined);
  const sessionBusy =
    starting || (session !== null && ACTIVE_SESSION_STATES.includes(session.state));

  function updateActiveSource(sourceCode: string) {
    if (!activeFileId) return;
    setFiles((current) =>
      current.map((file) =>
        file.id === activeFileId ? { ...file, sourceCode } : file,
      ),
    );
  }

  function createFile() {
    const file: JavaGuiFile = {
      id: randomId(),
      name: nextFileName(files),
      sourceCode: "",
    };
    setFiles((current) => [...current, file]);
    setOpenFileIds((current) => [...current, file.id]);
    setActiveFileId(file.id);
    if (!mainFileId) setMainFileId(file.id);
    startRename(file.id, file.name);
  }

  function openFile(id: string) {
    setOpenFileIds((current) => (current.includes(id) ? current : [...current, id]));
    setActiveFileId(id);
  }

  function closeTab(id: string) {
    const next = openFileIds.filter((fileId) => fileId !== id);
    setOpenFileIds(next);
    if (id === activeFileId) setActiveFileId(next[next.length - 1] ?? null);
  }

  function deleteFile(id: string) {
    setFiles((current) => current.filter((file) => file.id !== id));
    closeTab(id);
    if (mainFileId === id) setMainFileId(null);
  }

  function startRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
  }

  function commitRename() {
    if (!renamingId) return;
    let name = renameValue.trim();
    if (!/\.java$/.test(name)) name += ".java";
    if (/^[A-Z][A-Za-z0-9_]*\.java$/.test(name)) {
      setFiles((current) =>
        current.map((file) =>
          file.id === renamingId ? { ...file, name } : file,
        ),
      );
    }
    setRenamingId(null);
  }

  async function run() {
    if (sessionBusy || !mainFileId) return;
    setStarting(true);
    setConsoleText("");
    setPanelTab("console");
    setSession(null);
    try {
      const response = await authorizedFetch("/v1/gui-sessions", {
        method: "POST",
        body: JSON.stringify({
          content: { files, openFileIds, activeFileId, mainFileId },
        }),
      });
      if (!response.ok) {
        setConsoleText(
          response.status === 400
            ? "Mark one file as the main class before running."
            : "The session could not be started.",
        );
        return;
      }
      const created = guiSessionSchema.parse(await response.json());
      setSession(created);
      if (created.grant) openConsoleSocket(created.id, created.grant);
    } catch {
      setConsoleText("The session could not be started.");
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (!session) return;
    const stoppingId = session.id;
    setSession((current) =>
      current ? { ...current, state: "stopped" } : current,
    );
    closeConsoleSocket();
    try {
      await authorizedFetch(`/v1/gui-sessions/${stoppingId}`, {
        method: "DELETE",
      });
    } catch {
      // The session poll (if it were still enabled) would reconcile — but
      // we've already optimistically marked it stopped client-side, and a
      // stuck server-side session still gets reaped by the safety net.
    }
  }

  const vncUrl =
    session?.state === "running" && session.grant
      ? guiSessionSocketUrl(session.id, "vnc", session.grant)
      : null;

  return (
    <section
      className={`${fullScreen ? "bg-canvas fixed inset-0 z-50 p-3" : ""} border-structural bg-deep rounded-panel overflow-hidden border`}
      aria-label="Java GUI Workbench"
    >
      <div className="border-divider bg-surface flex min-h-12 flex-wrap items-center gap-x-1 gap-y-2 border-b px-2 py-1.5">
        {sessionBusy && session?.state !== "requested" ? (
          <button
            onClick={() => void stop()}
            className="bg-danger rounded-control flex min-h-9 items-center gap-2 px-3 text-xs font-semibold text-white"
          >
            <Square aria-hidden="true" size={13} /> Stop
          </button>
        ) : (
          <button
            onClick={() => void run()}
            disabled={sessionBusy || !mainFileId}
            className="bg-action rounded-control flex min-h-9 items-center gap-2 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {sessionBusy ? <Spinner /> : <Play aria-hidden="true" size={14} />}
            {sessionBusy ? "Starting…" : "Run"}
          </button>
        )}

        <button
          onClick={createFile}
          className="border-structural text-ink-secondary rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs"
        >
          <FilePlus2 aria-hidden="true" size={13} /> New file
        </button>

        <span className="text-ink-muted ml-auto hidden items-center gap-1.5 text-[11px] sm:flex">
          {loadState === "loading" || saveStatus === "saving" ? (
            <Spinner size={11} />
          ) : null}
          {loadState === "loading"
            ? "Loading your files…"
            : loadState === "error"
              ? "Couldn't load your files"
              : saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "error"
                  ? "Couldn't save"
                  : "Saved"}
        </span>

        {session?.state === "running" && remainingSeconds !== null ? (
          <span
            className={`ml-auto text-[11px] font-medium sm:ml-0 ${
              remainingSeconds < 30 ? "text-danger" : "text-ink-muted"
            }`}
          >
            {formatRemaining(remainingSeconds)} remaining
          </span>
        ) : null}

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
          className="border-divider bg-sidebar hidden w-56 shrink-0 overflow-auto border-r lg:block"
          aria-label="Java files"
        >
          <div className="border-divider flex items-center justify-between border-b px-3 py-2">
            <span className="text-ink-secondary flex items-center gap-2 text-xs font-semibold">
              <Braces aria-hidden="true" size={14} /> Files
            </span>
          </div>
          <div className="p-2">
            {files.length === 0 ? (
              <p className="text-ink-muted px-2 py-3 text-[11px]">
                No files yet. Create one to get started.
              </p>
            ) : null}
            {files.map((file) => {
              const isActive = file.id === activeFileId;
              const isMain = file.id === mainFileId;
              const isRenaming = renamingId === file.id;
              return (
                <div
                  key={file.id}
                  className={`${
                    isActive ? "bg-elevated" : "hover:bg-elevated"
                  } group rounded-control flex min-h-8 items-center gap-1 pr-1`}
                >
                  <button
                    onClick={() => setMainFileId(file.id)}
                    aria-label={
                      isMain
                        ? `${file.name} is the main class`
                        : `Mark ${file.name} as the main class`
                    }
                    aria-pressed={isMain}
                    className={`grid size-7 shrink-0 place-items-center ${
                      isMain ? "text-warning" : "text-ink-disabled hover:text-ink-muted"
                    }`}
                  >
                    <Star
                      aria-hidden="true"
                      size={12}
                      fill={isMain ? "currentColor" : "none"}
                    />
                  </button>
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
                      onDoubleClick={() => startRename(file.id, file.name)}
                      onClick={() => openFile(file.id)}
                      className={`${
                        isActive ? "text-ink-primary" : "text-ink-secondary"
                      } min-w-0 flex-1 truncate py-1.5 text-left text-xs`}
                    >
                      {file.name}
                    </button>
                  )}
                  <div className="flex shrink-0 items-center gap-0.5 lg:hidden lg:group-hover:flex">
                    <button
                      onClick={() => startRename(file.id, file.name)}
                      aria-label={`Rename ${file.name}`}
                      className="text-ink-muted grid size-7 place-items-center"
                    >
                      <Pencil aria-hidden="true" size={11} />
                    </button>
                    <button
                      onClick={() => deleteFile(file.id)}
                      aria-label={`Delete ${file.name}`}
                      className="text-ink-muted hover:text-danger grid size-7 place-items-center"
                    >
                      <Trash2 aria-hidden="true" size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="grid min-w-0 flex-1" style={{ gridTemplateRows: "minmax(220px, 1fr) 260px" }}>
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
                    {file.id === mainFileId ? (
                      <Star
                        aria-hidden="true"
                        size={10}
                        className="text-warning shrink-0"
                        fill="currentColor"
                      />
                    ) : null}
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
                language="java"
                onChange={updateActiveSource}
                fontSize={13}
                onRunShortcut={() => void run()}
              />
            ) : (
              <div className="text-ink-muted grid h-full place-items-center p-8 text-xs">
                Select a file from the sidebar, or create a new one.
              </div>
            )}
          </div>

          <div className="border-divider bg-surface min-h-0 overflow-hidden border-t">
            <div className="border-divider flex min-h-10 items-center gap-1 border-b px-2 py-1">
              <button
                onClick={() => setPanelTab("console")}
                className={`${
                  panelTab === "console" ? "text-ink-primary bg-elevated" : "text-ink-muted"
                } rounded-control flex min-h-8 items-center gap-2 px-3 text-xs`}
              >
                <Terminal aria-hidden="true" size={13} /> Console
              </button>
              <button
                onClick={() => setPanelTab("viewport")}
                className={`${
                  panelTab === "viewport" ? "text-ink-primary bg-elevated" : "text-ink-muted"
                } rounded-control flex min-h-8 items-center gap-2 px-3 text-xs`}
              >
                <MonitorPlay aria-hidden="true" size={13} /> GUI Viewport
              </button>
              {session?.state === "failed" ? (
                <span className="text-danger ml-auto flex items-center gap-1.5 px-2 text-[11px]">
                  <CircleAlert aria-hidden="true" size={12} />
                  {session.failureCode ?? "Failed"}
                </span>
              ) : null}
            </div>
            <div className="h-[calc(100%-2.5rem)] overflow-auto">
              {panelTab === "console" ? (
                <pre className="text-ink-primary h-full w-full overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                  {consoleText || "Click Run to compile and start your program."}
                </pre>
              ) : (
                <GuiViewport url={vncUrl} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
