"use client";

import {
  codeExecutionHistoryItemSchema,
  codeWorkspaceSchema,
  countCodeWorkspaceFiles,
  erdDiagramSummarySchema,
  workspaceSummarySchema,
  type WorkspaceSummary,
} from "@sqweb/contracts";
import {
  ArrowRight,
  Code2,
  Database,
  History,
  Inbox,
  Network,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import {
  codeWorkspaceGuideSteps,
  erdWorkspaceGuideSteps,
  sqlWorkspaceGuideSteps,
} from "./workspace-guide-content";
import { WorkspaceGuideModal } from "./workspace-guide-modal";
import {
  CodeWorkspacePreview,
  ErdWorkspacePreview,
  SqlWorkspacePreview,
} from "./workspace-preview";

const workspaceStateLabel: Readonly<Record<WorkspaceSummary["state"], string>> =
  {
    requested: "Requested",
    provisioning: "Provisioning",
    ready: "Ready",
    resetting: "Resetting",
    suspended: "Suspended",
    failed: "Failed",
    expired: "Expired",
    deleting: "Deleting",
    deleted: "Deleted",
  };

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface ActivityItem {
  id: string;
  kind: "sql" | "code" | "erd";
  label: string;
  detail: string;
  timestamp: string;
}

export function StudentDashboard() {
  const { authorizedFetch, executionFetch } = useAuth();
  const [workspaces, setWorkspaces] = useState<
    readonly WorkspaceSummary[] | null
  >(null);
  const [codeFileCount, setCodeFileCount] = useState<number | null>(null);
  const [erdDiagramCount, setErdDiagramCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<readonly ActivityItem[] | null>(
    null,
  );
  const [activeGuide, setActiveGuide] = useState<"sql" | "code" | "erd" | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const workspacesRes = await authorizedFetch("/v1/workspaces");
      if (cancelled) return;
      if (workspacesRes.ok) {
        setWorkspaces(
          workspaceSummarySchema.array().parse(await workspacesRes.json()),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  const readyWorkspace = workspaces?.find(
    (workspace) => workspace.state === "ready",
  );
  const workspace = workspaces?.[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [workspaceRes, codeRes, codeHistoryRes, erdRes] = await Promise.all(
        [
          readyWorkspace
            ? executionFetch(
                `/v1/query-history?workspaceId=${encodeURIComponent(readyWorkspace.id)}`,
              )
            : null,
          authorizedFetch("/v1/code-workspace"),
          executionFetch("/v1/code-execution-history"),
          authorizedFetch("/v1/erd-diagrams"),
        ],
      );
      if (cancelled) return;

      const items: ActivityItem[] = [];

      if (workspaceRes?.ok) {
        const history = (await workspaceRes.json()) as {
          id: string;
          state: string;
          statementClasses: readonly string[];
          durationMs: number | null;
          rowsReturned: number;
          startedAt: string;
        }[];
        for (const item of history) {
          items.push({
            id: `sql-${item.id}`,
            kind: "sql",
            label: item.statementClasses.join(", ") || item.state,
            detail: `${item.durationMs ?? 0} ms · ${item.rowsReturned} rows`,
            timestamp: item.startedAt,
          });
        }
      }

      if (codeRes.ok) {
        const codeWorkspace = codeWorkspaceSchema.parse(await codeRes.json());
        setCodeFileCount(countCodeWorkspaceFiles(codeWorkspace.content.root));
      }

      if (codeHistoryRes.ok) {
        const history = codeExecutionHistoryItemSchema
          .array()
          .parse(await codeHistoryRes.json());
        for (const item of history) {
          items.push({
            id: `code-${item.id}`,
            kind: "code",
            label: item.language,
            detail: `${item.status.replaceAll("_", " ")}${item.timeMs !== null ? ` · ${item.timeMs} ms` : ""}`,
            timestamp: item.startedAt,
          });
        }
      }

      if (erdRes.ok) {
        const diagrams = erdDiagramSummarySchema
          .array()
          .parse(await erdRes.json());
        setErdDiagramCount(diagrams.length);
        for (const diagram of diagrams) {
          items.push({
            id: `erd-${diagram.id}`,
            kind: "erd",
            label: diagram.name,
            detail: "Diagram updated",
            timestamp: diagram.updatedAt,
          });
        }
      }

      items.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setActivity(items.slice(0, 6));
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, executionFetch, readyWorkspace]);

  const activityIcon: Record<ActivityItem["kind"], typeof Database> = {
    sql: SquareTerminal,
    code: Code2,
    erd: Network,
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={Database}
          label="SQL Workspace"
          value={workspace ? workspaceStateLabel[workspace.state] : "None yet"}
        />
        <StatTile
          icon={Code2}
          label="Code files"
          value={codeFileCount === null ? "…" : String(codeFileCount)}
        />
        <StatTile
          icon={Network}
          label="ERD diagrams"
          value={erdDiagramCount === null ? "…" : String(erdDiagramCount)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section
          aria-labelledby="workspace-guides-title"
          className="rounded-panel border-structural bg-deep border"
        >
          <div className="border-divider border-b px-4 py-3">
            <h3
              id="workspace-guides-title"
              className="font-heading text-ink-primary text-base font-semibold"
            >
              Explore your workspaces
            </h3>
            <p className="text-ink-muted mt-0.5 text-xs">
              A guided tour of what each one can do, with samples to try
            </p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <WorkspaceGuideCard
              icon={SquareTerminal}
              label="SQL Workspace"
              detail="Build schemas, insert data, and inspect query results in your own isolated MySQL database."
              highlights={[
                "Schema explorer and query history",
                "Saved queries and ERD generation",
                "Destructive-query safeguards",
              ]}
              stepCount={sqlWorkspaceGuideSteps.length}
              preview={<SqlWorkspacePreview />}
              onClick={() => setActiveGuide("sql")}
            />
            <WorkspaceGuideCard
              icon={Code2}
              label="Code Workspace"
              detail="Organize programs and run them through a live console that responds as your code asks for input."
              highlights={[
                "Python, Java, C++, JavaScript, and C",
                "Interactive prompts and stdin",
                "Autosaved files and folders",
              ]}
              stepCount={codeWorkspaceGuideSteps.length}
              preview={<CodeWorkspacePreview />}
              onClick={() => setActiveGuide("code")}
            />
            <WorkspaceGuideCard
              icon={Network}
              label="ERD Workspace"
              detail="Turn database ideas into readable diagrams with editable entities, attributes, and relationships."
              highlights={[
                "Crow's-foot and UML notation",
                "Routed relationship lines",
                "Autosave and PDF export",
              ]}
              stepCount={erdWorkspaceGuideSteps.length}
              preview={<ErdWorkspacePreview />}
              onClick={() => setActiveGuide("erd")}
            />
          </div>
        </section>

        <section
          aria-labelledby="activity-title"
          className="rounded-panel border-structural bg-surface overflow-hidden border"
        >
          <div className="border-divider border-b px-4 py-3">
            <h3
              id="activity-title"
              className="font-heading text-ink-primary text-base font-semibold"
            >
              Recent activity
            </h3>
            <p className="text-ink-muted mt-0.5 text-xs">
              Across all three workspaces
            </p>
          </div>
          {activity === null ? (
            <EmptyState icon={History} text="Loading recent activity…" />
          ) : activity.length === 0 ? (
            <EmptyState
              icon={History}
              text="No activity yet — run a query, execute some code, or edit a diagram."
            />
          ) : (
            <ul className="divide-divider divide-y">
              {activity.map((item) => {
                const Icon = activityIcon[item.kind];
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span className="rounded-control border-divider bg-panel text-action-soft grid size-9 shrink-0 place-items-center border">
                      <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-primary truncate text-sm font-medium capitalize">
                        {item.label}
                      </p>
                      <p className="text-ink-muted mt-0.5 text-xs">
                        {item.detail} · {timeAgo(item.timestamp)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {activeGuide === "sql" ? (
        <WorkspaceGuideModal
          icon={SquareTerminal}
          title="SQL Workspace guide"
          description="A practical path from your first table to reusable queries and an ERD."
          steps={sqlWorkspaceGuideSteps}
          ctaLabel="Open SQL Workspace"
          ctaHref="/student/workspaces"
          onClose={() => setActiveGuide(null)}
        />
      ) : null}
      {activeGuide === "code" ? (
        <WorkspaceGuideModal
          icon={Code2}
          title="Code Workspace guide"
          description="Learn the file workflow, supported languages, and live interactive Console."
          steps={codeWorkspaceGuideSteps}
          ctaLabel="Open Code Workspace"
          ctaHref="/student/code-workspace"
          onClose={() => setActiveGuide(null)}
        />
      ) : null}
      {activeGuide === "erd" ? (
        <WorkspaceGuideModal
          icon={Network}
          title="ERD Workspace guide"
          description="Build readable entities and route clearly annotated relationships."
          steps={erdWorkspaceGuideSteps}
          ctaLabel="Open ERD Workspace"
          ctaHref="/student/erd-workspace"
          onClose={() => setActiveGuide(null)}
        />
      ) : null}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: typeof Database;
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-panel border-structural bg-surface flex items-center gap-3 border p-4">
      <span className="rounded-control border-divider bg-panel text-info grid size-10 shrink-0 place-items-center border">
        <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="text-ink-primary text-lg font-semibold">{value}</p>
        <p className="text-ink-muted text-xs">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: Readonly<{ icon: typeof Inbox; text: string }>) {
  return (
    <div className="grid min-h-32 place-items-center px-6 py-8 text-center">
      <div>
        <Icon
          aria-hidden="true"
          className="text-ink-disabled mx-auto mb-2"
          size={20}
        />
        <p className="text-ink-muted max-w-xs text-xs leading-5">{text}</p>
      </div>
    </div>
  );
}

function WorkspaceGuideCard({
  icon: Icon,
  label,
  detail,
  highlights,
  stepCount,
  preview,
  onClick,
}: Readonly<{
  icon: typeof Code2;
  label: string;
  detail: string;
  highlights: readonly string[];
  stepCount: number;
  preview: ReactNode;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-structural bg-surface hover:border-action/40 group rounded-panel flex flex-col items-start overflow-hidden border text-left transition-colors"
    >
      {preview}
      <div className="group-hover:bg-elevated flex w-full flex-1 flex-col items-start gap-3 p-5 transition-colors">
        <span className="rounded-control border-divider bg-panel text-action-soft grid size-11 shrink-0 place-items-center border">
          <Icon aria-hidden="true" size={20} strokeWidth={1.7} />
        </span>
        <div className="flex-1">
          <p className="text-ink-primary text-sm font-semibold">{label}</p>
          <p className="text-ink-muted mt-1 text-xs leading-5">{detail}</p>
          <ul className="mt-3 space-y-1.5">
            {highlights.map((highlight) => (
              <li
                key={highlight}
                className="text-ink-secondary flex items-start gap-2 text-[11px] leading-4"
              >
                <span
                  aria-hidden="true"
                  className="bg-action-soft mt-1.5 size-1 shrink-0 rounded-full"
                />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
        <span className="text-action-soft flex items-center gap-1 text-xs font-medium">
          View {stepCount}-step guide
          <ArrowRight
            aria-hidden="true"
            size={13}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </button>
  );
}
