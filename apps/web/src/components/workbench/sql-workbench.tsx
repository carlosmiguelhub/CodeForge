"use client";

import {
  executionGrantResponseSchema,
  executionResponseSchema,
  workspaceSchemaResponseSchema,
  type ExecutionResponse,
  type WorkspaceSchemaResponse,
} from "@sqweb/contracts";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Database,
  Eye,
  Expand,
  FilePlus2,
  History,
  KeyRound,
  ListTree,
  Maximize2,
  MessageSquareText,
  Play,
  Plus,
  RefreshCw,
  Table2,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SqlEditor, type SqlEditorController } from "./sql-editor";

interface EditorTab {
  id: string;
  name: string;
  sql: string;
}

interface HistoryItem {
  id: string;
  state: string;
  statementClasses: readonly string[];
  durationMs: number | null;
  rowsReturned: number;
  startedAt: string;
}

const starterSql = `-- Your isolated MySQL workspace is ready.
SELECT 'Hello from SQWeb' AS message, CURRENT_TIMESTAMP AS executed_at;`;

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

export function SqlWorkbench({
  workspaceId,
}: Readonly<{ workspaceId: string }>) {
  const { authorizedFetch, executionFetch } = useAuth();
  const [tabs, setTabs] = useState<EditorTab[]>([
    { id: "query-1", name: "Query 1", sql: starterSql },
  ]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id ?? "");
  const [schema, setSchema] = useState<WorkspaceSchemaResponse>({ tables: [] });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [result, setResult] = useState<ExecutionResponse | null>(null);
  const [resultSetIndex, setResultSetIndex] = useState(0);
  const [history, setHistory] = useState<readonly HistoryItem[]>([]);
  const [status, setStatus] = useState("Connecting to isolated workspace…");
  const [running, setRunning] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<
    "results" | "messages" | "history"
  >("results");
  const [schemaWidth, setSchemaWidth] = useState(248);
  const [bottomHeight, setBottomHeight] = useState(280);
  const [fullScreen, setFullScreen] = useState(false);
  const [mobileSchemaOpen, setMobileSchemaOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    sql: string;
    mode: "current" | "selected" | "script";
    token: string;
  } | null>(null);
  const editorRef = useRef<SqlEditorController>(null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const getGrant = useCallback(async () => {
    const response = await authorizedFetch(
      "/v1/execution-grants",
      {
        method: "POST",
        body: JSON.stringify({ workspaceId, requestedMode: "interactive" }),
      },
      true,
    );
    if (!response.ok)
      throw new Error("Execution authorization could not be issued.");
    return executionGrantResponseSchema.parse(await response.json());
  }, [authorizedFetch, workspaceId]);

  const loadSchema = useCallback(async () => {
    try {
      const grant = await getGrant();
      const response = await executionFetch(
        `/v1/workspaces/${workspaceId}/schema`,
        {
          headers: { "X-SQWeb-Execution-Grant": grant.grant },
        },
      );
      if (!response.ok) throw new Error("Schema metadata could not be loaded.");
      setSchema(workspaceSchemaResponseSchema.parse(await response.json()));
      setStatus("Connected · ready for SQL");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Workspace connection failed.",
      );
    }
  }, [executionFetch, getGrant, workspaceId]);

  const loadHistory = useCallback(async () => {
    const response = await executionFetch(
      `/v1/query-history?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    if (response.ok) setHistory((await response.json()) as HistoryItem[]);
  }, [executionFetch, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([loadSchema(), loadHistory()]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory, loadSchema]);

  function updateActiveSql(sql: string) {
    setTabs((current) =>
      current.map((tab) => (tab.id === activeTabId ? { ...tab, sql } : tab)),
    );
  }

  function previewTable(tableName: string) {
    const sql = `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100;`;
    setSelectedTable(tableName);
    setExpanded((current) => new Set(current).add(tableName));
    updateActiveSql(sql);
    setMobileSchemaOpen(false);
    void execute(sql, "current");
  }

  async function execute(
    sql: string,
    mode: "current" | "selected" | "script",
    confirmationToken?: string,
  ) {
    if (!sql.trim() || running) return;
    const executionId = crypto.randomUUID();
    setRunning(true);
    setRunningId(executionId);
    setStatus("Running query…");
    setResultTab("results");
    setResultSetIndex(0);
    try {
      const grant = await getGrant();
      const response = await executionFetch("/v1/executions", {
        method: "POST",
        body: JSON.stringify({
          executionId,
          grant: grant.grant,
          sql,
          selection:
            mode === "selected"
              ? { mode, startOffset: 0, endOffset: sql.length }
              : { mode },
          transactionMode: "auto",
          ...(confirmationToken ? { confirmation: confirmationToken } : {}),
        }),
      });
      const payload = await response.json();
      if (response.status === 409 && payload.error?.confirmation?.token) {
        setConfirmation({ sql, mode, token: payload.error.confirmation.token });
        setStatus("Confirmation required for destructive SQL.");
        return;
      }
      if (!response.ok)
        throw new Error(payload.error?.message ?? "The query was rejected.");
      const parsed = executionResponseSchema.parse(payload);
      setResult(parsed);
      setStatus(
        parsed.state === "successful"
          ? `Successful · ${parsed.statistics.durationMs} ms · ${parsed.statistics.rowsReturned} rows`
          : (parsed.messages[0]?.text ?? parsed.state),
      );
      if (parsed.state !== "successful") setResultTab("messages");
      await Promise.all([loadSchema(), loadHistory()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Execution failed.");
      setResultTab("messages");
    } finally {
      setRunning(false);
      setRunningId(null);
    }
  }

  function run(mode: "current" | "selected" | "script") {
    const selected = editorRef.current?.getSelectedSql().trim() ?? "";
    const sql =
      mode === "selected"
        ? selected
        : mode === "current"
          ? selected || (editorRef.current?.getCurrentSql() ?? "")
          : (activeTab?.sql ?? "");
    void execute(
      sql || activeTab?.sql || "",
      selected && mode === "current" ? "selected" : mode,
    );
  }

  async function cancel() {
    if (!runningId) return;
    await executionFetch(`/v1/executions/${runningId}`, { method: "DELETE" });
    setStatus("Cancellation requested…");
  }

  function addTab() {
    const tab = {
      id: crypto.randomUUID(),
      name: `Query ${tabs.length + 1}`,
      sql: "",
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    if (tabs.length === 1) return;
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (id === activeTabId) setActiveTabId(next[0]?.id ?? "");
  }

  function beginHorizontalResize(event: PointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = schemaWidth;
    const move = (moveEvent: globalThis.PointerEvent) =>
      setSchemaWidth(
        Math.min(420, Math.max(190, startWidth + moveEvent.clientX - startX)),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resizeSchemaByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setSchemaWidth((value) =>
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

  function resizeResultsByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
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

  return (
    <section
      className={`${fullScreen ? "bg-canvas fixed inset-0 z-50 p-3" : ""} border-structural bg-deep rounded-panel overflow-hidden border`}
      aria-label="SQL Workbench"
    >
      <div className="border-divider bg-surface flex min-h-12 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <button
          onClick={() => run("current")}
          disabled={running}
          className="bg-action rounded-control flex min-h-9 items-center gap-2 px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Play aria-hidden="true" size={14} /> Run current
        </button>
        <button
          onClick={() => run("selected")}
          disabled={running}
          className="border-structural text-ink-secondary rounded-control min-h-9 border px-3 text-xs disabled:opacity-50"
        >
          Run selected
        </button>
        <button
          onClick={() => run("script")}
          disabled={running}
          className="text-ink-secondary rounded-control min-h-9 px-3 text-xs disabled:opacity-50"
        >
          Run script
        </button>
        {running ? (
          <button
            onClick={() => void cancel()}
            className="text-error rounded-control flex min-h-9 items-center gap-2 px-3 text-xs"
          >
            <CircleStop aria-hidden="true" size={14} /> Cancel
          </button>
        ) : null}
        <span className="border-divider mx-1 h-5 border-l" />
        <button
          onClick={() => setMobileSchemaOpen(true)}
          className="border-structural text-ink-secondary rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs lg:hidden"
        >
          <ListTree aria-hidden="true" size={14} /> Schema
        </button>
        <button
          onClick={() => {
            const sql =
              editorRef.current?.getCurrentSql() ?? activeTab?.sql ?? "";
            void execute(`EXPLAIN ${sql.replace(/;\s*$/, "")}`, "current");
          }}
          disabled={running}
          className="text-ink-secondary rounded-control min-h-9 px-3 text-xs"
        >
          EXPLAIN
        </button>
        <span className="text-ink-muted ml-auto hidden text-[11px] sm:inline">
          Autocommit · 10s · 1,000 rows
        </span>
        <button
          onClick={() => setFullScreen((value) => !value)}
          aria-label={fullScreen ? "Exit full screen" : "Open full screen"}
          className="text-ink-muted rounded-control grid size-9 place-items-center"
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
        style={{ height: fullScreen ? "calc(100dvh - 72px)" : 680 }}
      >
        <aside
          className="border-divider bg-sidebar hidden shrink-0 overflow-auto border-r lg:block"
          style={{ width: schemaWidth }}
          aria-label="Database explorer"
        >
          <div className="border-divider flex items-center justify-between border-b px-3 py-2">
            <span className="text-ink-secondary flex items-center gap-2 text-xs font-semibold">
              <ListTree aria-hidden="true" size={14} /> Schema
            </span>
            <button
              onClick={() => void loadSchema()}
              aria-label="Refresh schema"
              className="text-ink-muted grid size-8 place-items-center"
            >
              <RefreshCw aria-hidden="true" size={13} />
            </button>
          </div>
          <div className="p-2">
            <div className="text-ink-muted flex items-center gap-2 px-2 py-1.5 text-xs">
              <Database aria-hidden="true" size={13} />
              <span>workspace</span>
              <span className="ml-auto font-mono text-[10px]">
                {schema.tables.length}{" "}
                {schema.tables.length === 1 ? "table" : "tables"}
              </span>
            </div>
            {schema.tables.length === 0 ? (
              <p className="text-ink-muted px-2 py-3 text-[11px]">
                No tables yet.
              </p>
            ) : null}
            {schema.tables.map((table) => {
              const open = expanded.has(table.name);
              const selected = selectedTable === table.name;
              return (
                <div
                  key={table.name}
                  className={`${selected ? "bg-elevated" : ""} rounded-control mb-0.5 overflow-hidden`}
                >
                  <div className="flex min-h-9 items-center px-1">
                    <button
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(table.name)) next.delete(table.name);
                          else next.add(table.name);
                          return next;
                        })
                      }
                      aria-label={`${open ? "Collapse" : "Expand"} ${table.name} structure`}
                      aria-expanded={open}
                      className="text-ink-muted grid size-8 shrink-0 place-items-center"
                    >
                      {open ? (
                        <ChevronDown aria-hidden="true" size={12} />
                      ) : (
                        <ChevronRight aria-hidden="true" size={12} />
                      )}
                    </button>
                    <button
                      onClick={() => previewTable(table.name)}
                      disabled={running}
                      aria-label={`Preview rows from ${table.name}`}
                      className="text-ink-secondary flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs disabled:opacity-50"
                    >
                      <Table2 aria-hidden="true" size={13} />
                      <span className="truncate font-medium">{table.name}</span>
                      <span className="text-ink-muted ml-auto font-mono text-[9px]">
                        {table.columns.length} cols
                      </span>
                    </button>
                  </div>
                  {open ? (
                    <div className="border-divider ml-5 border-l pr-2 pb-2 pl-3">
                      {table.columns.map((column, columnIndex) => (
                        <div
                          key={`${table.name}:${column.name}:${columnIndex}`}
                          className="text-ink-muted flex min-h-7 items-center gap-2 text-[11px]"
                        >
                          {column.key === "PRI" ? (
                            <KeyRound
                              aria-hidden="true"
                              className="text-warning shrink-0"
                              size={11}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="border-structural size-2.5 shrink-0 rounded-full border"
                            />
                          )}
                          {column.key === "PRI" ? (
                            <span className="sr-only">Primary key</span>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">
                            {column.name}
                          </span>
                          <span className="text-action-soft font-mono text-[9px]">
                            {column.dataType}
                          </span>
                          {column.nullable ? (
                            <span className="text-ink-muted text-[8px] uppercase">
                              null
                            </span>
                          ) : null}
                        </div>
                      ))}
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          onClick={() => previewTable(table.name)}
                          disabled={running}
                          className="text-action-soft hover:bg-elevated-high rounded-control flex min-h-8 items-center gap-1.5 px-2 text-[10px] disabled:opacity-50"
                        >
                          <Eye aria-hidden="true" size={11} /> View rows
                        </button>
                        <button
                          onClick={() =>
                            updateActiveSql(
                              `SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`,
                            )
                          }
                          className="text-ink-muted hover:bg-elevated-high rounded-control min-h-8 px-2 text-[10px]"
                        >
                          Insert SQL
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>
        <div
          role="separator"
          aria-label="Resize schema explorer"
          aria-orientation="vertical"
          aria-valuemin={190}
          aria-valuemax={420}
          aria-valuenow={schemaWidth}
          tabIndex={0}
          onPointerDown={beginHorizontalResize}
          onKeyDown={resizeSchemaByKeyboard}
          className="bg-divider hover:bg-action hidden w-1 cursor-col-resize lg:block"
        />

        <div
          className="grid min-w-0 flex-1"
          style={{
            gridTemplateRows: `minmax(260px, 1fr) 4px ${bottomHeight}px`,
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-divider bg-secondary flex h-10 items-end overflow-x-auto border-b">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`${tab.id === activeTabId ? "bg-deep text-ink-primary border-action" : "text-ink-muted border-transparent"} flex h-10 min-w-32 items-center justify-between gap-3 border-t-2 px-3 text-xs`}
                >
                  <button
                    aria-pressed={tab.id === activeTabId}
                    onClick={() => setActiveTabId(tab.id)}
                    className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Braces aria-hidden="true" size={12} /> {tab.name}
                  </button>
                  {tabs.length > 1 ? (
                    <button
                      aria-label={`Close ${tab.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="grid size-7 shrink-0 place-items-center"
                    >
                      <X aria-hidden="true" size={12} />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                onClick={addTab}
                aria-label="New query tab"
                className="text-ink-muted grid h-10 min-w-10 place-items-center"
              >
                <Plus aria-hidden="true" size={14} />
              </button>
            </div>
            {activeTab ? (
              <SqlEditor
                key={activeTab.id}
                ref={editorRef}
                value={activeTab.sql}
                onChange={updateActiveSql}
                fontSize={13}
              />
            ) : null}
          </div>

          <div
            role="separator"
            aria-label="Resize query results"
            aria-orientation="horizontal"
            aria-valuemin={160}
            aria-valuemax={520}
            aria-valuenow={bottomHeight}
            tabIndex={0}
            onPointerDown={beginVerticalResize}
            onKeyDown={resizeResultsByKeyboard}
            className="bg-divider hover:bg-action cursor-row-resize"
          />

          <div className="border-divider bg-surface min-h-0 overflow-hidden border-t">
            <div className="border-divider flex h-10 items-center border-b px-2">
              {(
                [
                  ["results", Table2, "Results"],
                  ["messages", MessageSquareText, "Messages"],
                  ["history", History, "History"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => setResultTab(id)}
                  className={`${resultTab === id ? "text-ink-primary bg-elevated" : "text-ink-muted"} rounded-control flex min-h-8 items-center gap-2 px-3 text-xs`}
                >
                  <Icon aria-hidden="true" size={13} /> {label}
                </button>
              ))}
              <span
                role="status"
                aria-live="polite"
                className="text-ink-muted ml-auto truncate px-2 text-[11px]"
              >
                {status}
              </span>
            </div>
            <div className="h-[calc(100%-2.5rem)] overflow-auto">
              {resultTab === "results" ? (
                <ResultGrid
                  result={result}
                  activeIndex={resultSetIndex}
                  onSelect={setResultSetIndex}
                />
              ) : null}
              {resultTab === "messages" ? (
                <MessagePanel result={result} status={status} />
              ) : null}
              {resultTab === "history" ? (
                <HistoryPanel history={history} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {confirmation ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="destructive-title"
          className="bg-canvas/80 fixed inset-0 z-[60] grid place-items-center p-4 backdrop-blur-sm"
        >
          <div className="border-structural bg-elevated rounded-panel w-full max-w-md border p-5 shadow-2xl">
            <h2
              id="destructive-title"
              className="font-heading text-ink-primary text-lg font-semibold"
            >
              Confirm destructive SQL
            </h2>
            <p className="text-ink-muted mt-2 text-sm">
              This statement can permanently remove workspace objects or data.
              Review it before continuing.
            </p>
            <pre className="border-divider bg-deep text-error mt-4 max-h-40 overflow-auto border p-3 font-mono text-xs whitespace-pre-wrap">
              {confirmation.sql}
            </pre>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmation(null)}
                className="border-structural text-ink-secondary rounded-control min-h-10 border px-4 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const pending = confirmation;
                  setConfirmation(null);
                  void execute(pending.sql, pending.mode, pending.token);
                }}
                className="bg-error-container text-error rounded-control min-h-10 px-4 text-sm font-semibold"
              >
                Run destructive SQL
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mobileSchemaOpen ? (
        <div
          className="bg-canvas/80 fixed inset-0 z-[55] flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Database explorer"
        >
          <aside className="border-structural bg-sidebar h-full w-[min(88vw,22rem)] overflow-auto border-r p-2">
            <div className="border-divider flex min-h-12 items-center justify-between border-b px-2">
              <span className="text-ink-primary text-sm font-semibold">
                Database explorer
              </span>
              <button
                onClick={() => setMobileSchemaOpen(false)}
                aria-label="Close database explorer"
                className="text-ink-muted grid size-10 place-items-center"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            {schema.tables.length === 0 ? (
              <p className="text-ink-muted p-3 text-xs">No tables yet.</p>
            ) : null}
            {schema.tables.map((table) => (
              <div key={table.name} className="border-divider border-b py-2">
                <button
                  onClick={() => previewTable(table.name)}
                  disabled={running}
                  className="text-ink-secondary flex min-h-10 w-full items-center gap-2 px-2 text-left text-xs font-semibold disabled:opacity-50"
                >
                  <Table2 aria-hidden="true" size={13} />
                  <span className="truncate">{table.name}</span>
                  <span className="text-ink-muted ml-auto font-mono text-[10px]">
                    {table.columns.length} columns
                  </span>
                </button>
                <p className="text-ink-muted truncate px-2 text-[11px]">
                  {table.columns.map((column) => column.name).join(", ")}
                </p>
                <div className="mt-1 flex gap-1 px-1">
                  <button
                    onClick={() => previewTable(table.name)}
                    disabled={running}
                    className="text-action-soft flex min-h-9 items-center gap-1.5 px-2 text-[11px] disabled:opacity-50"
                  >
                    <Eye aria-hidden="true" size={12} /> View rows
                  </button>
                  <button
                    onClick={() => {
                      updateActiveSql(
                        `SELECT * FROM ${quoteIdentifier(table.name)} LIMIT 100;`,
                      );
                      setMobileSchemaOpen(false);
                    }}
                    className="text-ink-muted min-h-9 px-2 text-[11px]"
                  >
                    Insert SQL
                  </button>
                </div>
              </div>
            ))}
          </aside>
          <button
            aria-label="Close database explorer"
            className="h-full flex-1"
            onClick={() => setMobileSchemaOpen(false)}
          />
        </div>
      ) : null}
    </section>
  );
}

function ResultGrid({
  result,
  activeIndex,
  onSelect,
}: Readonly<{
  result: ExecutionResponse | null;
  activeIndex: number;
  onSelect: (index: number) => void;
}>) {
  const set = result?.resultSets[activeIndex];
  if (!set)
    return (
      <div className="text-ink-muted grid h-full place-items-center p-8 text-xs">
        <div className="text-center">
          <FilePlus2 aria-hidden="true" className="mx-auto mb-2" size={20} />
          Run a query to view results.
        </div>
      </div>
    );
  if (set.columns.length === 0)
    return (
      <p className="text-ink-secondary p-4 text-xs">
        Statement completed · {set.affectedRows} affected rows ·{" "}
        {set.warningCount} warnings
      </p>
    );
  return (
    <div className="min-w-max">
      {(result?.resultSets.length ?? 0) > 1 ? (
        <div className="border-divider bg-deep sticky left-0 flex border-b p-1">
          {result?.resultSets.map((_, index) => (
            <button
              key={index}
              onClick={() => onSelect(index)}
              className={`${activeIndex === index ? "bg-elevated text-ink-primary" : "text-ink-muted"} rounded-control min-h-8 px-3 text-xs`}
            >
              Result {index + 1}
            </button>
          ))}
        </div>
      ) : null}
      <table className="border-collapse text-left text-xs">
        <thead className="bg-secondary text-ink-secondary sticky top-0 z-10">
          <tr>
            {set.columns.map((column, index) => (
              <th
                key={`${column.name}-${index}`}
                className="border-divider min-w-36 border-r border-b px-3 py-2 font-medium"
              >
                <span>{column.name}</span>
                <span className="text-ink-muted ml-2 font-mono text-[10px]">
                  {column.type}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {set.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-divider hover:bg-elevated border-b"
            >
              {row.map((cell, columnIndex) => (
                <td
                  key={columnIndex}
                  className="border-divider text-ink-primary max-w-96 border-r px-3 py-2 font-mono whitespace-nowrap"
                >
                  {cell === null ? (
                    <span className="text-ink-muted italic">NULL</span>
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessagePanel({
  result,
  status,
}: Readonly<{ result: ExecutionResponse | null; status: string }>) {
  return (
    <div className="space-y-2 p-3">
      {result?.messages.length ? (
        result.messages.map((message, index) => (
          <div
            key={index}
            className="border-divider bg-deep text-error border px-3 py-2 font-mono text-xs"
          >
            {message.text}
          </div>
        ))
      ) : (
        <p className="text-ink-muted text-xs">{status || "No messages."}</p>
      )}
    </div>
  );
}

function HistoryPanel({
  history,
}: Readonly<{ history: readonly HistoryItem[] }>) {
  if (!history.length)
    return <p className="text-ink-muted p-4 text-xs">No query history yet.</p>;
  return (
    <div>
      {history.map((item) => (
        <div
          key={item.id}
          className="border-divider grid grid-cols-[1fr_auto_auto] gap-4 border-b px-3 py-2 text-xs"
        >
          <span className="text-ink-secondary">
            {item.statementClasses.join(", ")}
          </span>
          <span className="text-ink-muted capitalize">{item.state}</span>
          <span className="text-ink-muted font-mono">
            {item.durationMs ?? 0} ms · {item.rowsReturned} rows
          </span>
        </div>
      ))}
    </div>
  );
}
